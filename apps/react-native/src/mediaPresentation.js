function tracksOf(stream, kind = 'video') {
  if (!stream || typeof stream.getTracks !== 'function') return [];
  try {
    return stream.getTracks().filter(track => track?.kind === kind);
  } catch (_) {
    return [];
  }
}

function isRenderableVideo(stream, requireEnabled = false) {
  return tracksOf(stream).some(
    track =>
      track.readyState === 'live' &&
      (!requireEnabled || track.enabled !== false),
  );
}

function streamIdentity(stream) {
  const trackIds = tracksOf(stream)
    .map(track => track?.id)
    .filter(Boolean);
  if (trackIds.length) return trackIds.map(id => `track:${id}`);
  return stream?.id ? [`stream:${stream.id}`] : [];
}

function sharesIdentity(first, second) {
  const firstIds = new Set(streamIdentity(first));
  return streamIdentity(second).some(id => firstIds.has(id));
}

function participantName(participant) {
  return (
    participant?.name ||
    participant?.displayName ||
    participant?.userName ||
    participant?.member ||
    ''
  );
}

function participantProducerId(participant) {
  return (
    participant?.videoID ||
    participant?.videoId ||
    participant?.videoProducerId ||
    ''
  );
}

function mediaStateFor({ participants, isLocal, name, producerId }) {
  if (!Array.isArray(participants)) return null;
  if (isLocal) {
    return participants.find(participant => participant?.isSelf) || null;
  }

  const normalizedName = String(name || '').trim().toLowerCase();
  return (
    participants.find(
      participant =>
        producerId && participantProducerId(participant) === producerId,
    ) ||
    participants.find(
      participant =>
        normalizedName &&
        participantName(participant).trim().toLowerCase() === normalizedName,
    ) ||
    null
  );
}

/**
 * Turn the React Native headless hook into a stable call-stage projection.
 *
 * Ordering is deliberate: an active screen share owns the stage, then the
 * remote camera, then the local camera. Audio is returned independently and
 * must be mounted in full even when only one video surface is visible.
 */
export function resolveCallMedia(room = {}, peerName = 'Guest') {
  const localVideo = isRenderableVideo(room.localVideo, true)
    ? room.localVideo
    : null;
  const screenStream = isRenderableVideo(
    room.screenShare?.stream,
    Boolean(room.screenShare?.isLocal),
  )
    ? room.screenShare.stream
    : null;

  const seen = new Set();
  const remoteCameras = (Array.isArray(room.remoteVideos)
    ? room.remoteVideos
    : []
  )
    .filter(entry => isRenderableVideo(entry?.stream))
    .filter(entry => !localVideo || !sharesIdentity(entry.stream, localVideo))
    .filter(entry => !screenStream || !sharesIdentity(entry.stream, screenStream))
    .filter(entry => {
      const keys = streamIdentity(entry.stream);
      const fallbackKey = entry?.producerId || entry?.stream?.id;
      const key = keys[0] || fallbackKey;
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    })
    .map((entry, index) => ({
      kind: 'camera',
      stream: entry.stream,
      producerId: entry.producerId || `remote-${index}`,
      name: entry.name || peerName,
      isLocal: false,
      state: mediaStateFor({
        participants: room.participants,
        isLocal: false,
        name: entry.name,
        producerId: entry.producerId,
      }),
    }));

  const localCamera = localVideo
    ? {
        kind: 'camera',
        stream: localVideo,
        producerId: 'local',
        name: 'You',
        isLocal: true,
        state: mediaStateFor({
          participants: room.participants,
          isLocal: true,
        }),
      }
    : null;

  const screen = screenStream
    ? {
        kind: 'screen',
        stream: screenStream,
        producerId: 'screen',
        name: room.screenShare?.isLocal ? 'Your screen' : `${peerName}'s screen`,
        isLocal: Boolean(room.screenShare?.isLocal),
        state: null,
      }
    : null;

  const cameras = [...remoteCameras, ...(localCamera ? [localCamera] : [])];
  const surfaces = [...(screen ? [screen] : []), ...cameras];

  return {
    primary: surfaces[0] || null,
    previews: surfaces.slice(1),
    surfaces,
    audioComponents: (Array.isArray(room.audioComponents)
      ? room.audioComponents
      : []
    ).filter(Boolean),
  };
}

export function mediaStateLabels(surface, room = {}) {
  if (!surface) return { microphone: 'Microphone off', camera: 'Camera off' };
  if (surface.kind === 'screen') {
    return { microphone: 'Screen share', camera: 'Screen live' };
  }
  const local = surface.isLocal;
  const hasAudio = local
    ? Boolean(room.micOn)
    : Boolean(surface.state?.hasAudio && !surface.state?.muted);
  const hasVideo = local ? Boolean(room.cameraOn) : true;
  return {
    microphone: hasAudio ? 'Microphone on' : 'Microphone off',
    camera: hasVideo ? 'Camera on' : 'Camera off',
  };
}

export default resolveCallMedia;
