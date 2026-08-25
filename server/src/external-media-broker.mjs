import crypto from 'node:crypto';

const SESSION_ID_PATTERN = /^ems_[a-f0-9]{24}$/;
const PLAYBACK_ID_PATTERN = /^emp_[a-f0-9]{24}$/;

function apiError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw apiError('The external media API must use HTTPS.', 500);
  }
  return url.origin;
}

function participantFor(session, userId) {
  if (session.hostUserId === userId) return { userId, peerUserId: session.targetUserId };
  if (session.targetUserId === userId) return { userId, peerUserId: session.hostUserId };
  throw apiError('This user is not a participant in the session.');
}

function publicPublisher(publisher) {
  return {
    sessionId: publisher.sessionId,
    url: publisher.url,
    token: publisher.token,
    tracks: [...publisher.tracks],
  };
}

function publicPlayback(playback) {
  return {
    playbackId: playback.playbackId,
    url: playback.url,
    token: playback.token,
    tracks: [...playback.tracks],
  };
}

/**
 * In-memory protocol lease broker for the SDK-free example.
 *
 * MediaSFU account credentials stay on the backend. Short-lived WHIP/WHEP
 * bearer tokens are returned only to the demo participant that needs them and
 * are never written to the JSON session store.
 */
export function createExternalMediaBroker({ env, fetchImpl, getSession }) {
  const apiUserName = env.MEDIASFU_API_USERNAME;
  const apiKey = env.MEDIASFU_API_KEY;
  const externalMediaOrigin = normalizeOrigin(
    env.MEDIASFU_EXTERNAL_MEDIA_API_URL || env.MEDIASFU_ROOM_API_URL || 'https://mediasfu.com',
  );
  const calls = new Map();

  const request = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
    if (!apiUserName || !apiKey) throw apiError('The local call backend is not configured.', 503);
    const response = await fetchImpl(`${externalMediaOrigin}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiUserName}:${apiKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw.replace(/^\uFEFF/, '').trim()) : {}; } catch { /* safe error below */ }
    if (!response.ok || payload.success === false) {
      const statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      const reason = text(payload.error);
      throw apiError(reason || `MediaSFU external media request failed (${response.status}).`, statusCode);
    }
    return payload;
  };

  const sessionPath = (meetingId, suffix = '') =>
    `/v1/meetings/${encodeURIComponent(meetingId)}/external-sessions${suffix}`;
  const playbackPath = (meetingId, suffix = '') =>
    `/v1/meetings/${encodeURIComponent(meetingId)}/playbacks${suffix}`;

  const readSession = async (sessionId) => {
    const session = await getSession(sessionId);
    if (!session) throw apiError('Session not found.', 404);
    if (session.status === 'ended') throw apiError('This call has ended.', 409);
    return session;
  };

  const callLease = (session) => {
    let lease = calls.get(session.id);
    if (!lease) {
      lease = { meetingId: session.meetingId, participants: new Map() };
      calls.set(session.id, lease);
    }
    if (lease.meetingId !== session.meetingId) throw apiError('Call media state is inconsistent.', 500);
    return lease;
  };

  const participantLease = (lease, userId) => {
    let participant = lease.participants.get(userId);
    if (!participant) {
      participant = { publisher: null, playbacks: new Map(), screenActive: false };
      lease.participants.set(userId, participant);
    }
    return participant;
  };

  const preparePublisher = async ({ sessionId, userId, displayName }) => {
    const session = await readSession(text(sessionId));
    const identity = participantFor(session, text(userId));
    const name = text(displayName);
    if (!/^[A-Za-z0-9]{2,10}$/.test(name)) {
      throw apiError('displayName must be alphanumeric and 2-10 characters.');
    }
    const lease = callLease(session);
    const participant = participantLease(lease, identity.userId);
    if (participant.publisher) {
      return { publisher: publicPublisher(participant.publisher), peerReady: lease.participants.has(identity.peerUserId) };
    }

    const tracks = session.callType === 'audio' ? ['audio'] : ['audio', 'video'];
    const payload = await request(sessionPath(session.meetingId), {
      method: 'POST',
      idempotencyKey: `familiar-${crypto.createHash('sha256').update(`${session.id}:${identity.userId}`).digest('hex')}`,
      body: {
        displayName: name,
        role: identity.userId === session.hostUserId ? 'host' : 'participant',
        ingest: { protocol: 'whip', tracks },
        metadata: { source: 'mediasfu-familiar-whip-whep' },
      },
    });
    const publisher = {
      sessionId: text(payload.sessionID),
      url: text(payload.ingest?.url),
      token: text(payload.ingest?.token),
      tracks,
    };
    if (!SESSION_ID_PATTERN.test(publisher.sessionId) || !/^https:\/\//i.test(publisher.url) || !publisher.token) {
      throw apiError('MediaSFU returned incomplete WHIP credentials.', 502);
    }
    participant.publisher = publisher;
    return { publisher: publicPublisher(publisher), peerReady: lease.participants.has(identity.peerUserId) };
  };

  const preparePeerPlayback = async ({ sessionId, userId }) => {
    const session = await readSession(text(sessionId));
    const identity = participantFor(session, text(userId));
    const lease = callLease(session);
    const participant = participantLease(lease, identity.userId);
    if (!participant.publisher) throw apiError('Prepare local publishing before requesting peer media.', 409);
    const peer = lease.participants.get(identity.peerUserId);
    if (!peer?.publisher) return { ready: false, reason: 'peer_not_prepared' };

    const peerPresentation = () => ({ screenActive: peer.screenActive === true });

    const existing = participant.playbacks.get(identity.peerUserId);
    if (existing) {
      return { ready: true, playback: publicPlayback(existing), peerPresentation: peerPresentation() };
    }

    const source = await request(
      sessionPath(session.meetingId, `/${encodeURIComponent(peer.publisher.sessionId)}`),
    );
    const activeKinds = new Set(
      Array.isArray(source.tracks)
        ? source.tracks.filter((track) => track?.state !== 'closed' && track?.state !== 'failed').map((track) => track.kind)
        : [],
    );
    if (source.state !== 'active' || peer.publisher.tracks.some((kind) => !activeKinds.has(kind))) {
      return {
        ready: false,
        reason: 'peer_media_not_active',
        sourceState: text(source.state) || 'provisioned',
        peerPresentation: peerPresentation(),
      };
    }

    const payload = await request(playbackPath(session.meetingId), {
      method: 'POST',
      idempotencyKey: `familiar-${crypto.createHash('sha256').update(`${session.id}:${identity.userId}:${identity.peerUserId}`).digest('hex')}`,
      body: {
        sourceSessionID: peer.publisher.sessionId,
        protocol: 'whep',
        tracks: [...peer.publisher.tracks],
      },
    });
    const playback = {
      playbackId: text(payload.playbackID),
      url: text(payload.endpointUrl),
      token: text(payload.playbackToken),
      tracks: [...peer.publisher.tracks],
    };
    if (!PLAYBACK_ID_PATTERN.test(playback.playbackId) || !/^https:\/\//i.test(playback.url) || !playback.token) {
      throw apiError('MediaSFU returned incomplete WHEP credentials.', 502);
    }
    participant.playbacks.set(identity.peerUserId, playback);
    return { ready: true, playback: publicPlayback(playback), peerPresentation: peerPresentation() };
  };

  const updatePresentation = async ({ sessionId, userId, screenActive }) => {
    if (typeof screenActive !== 'boolean') throw apiError('screenActive must be a boolean.');
    const session = await readSession(text(sessionId));
    const identity = participantFor(session, text(userId));
    const lease = calls.get(session.id);
    const participant = lease?.participants.get(identity.userId);
    if (!participant?.publisher) throw apiError('Prepare local publishing before updating presentation.', 409);
    participant.screenActive = screenActive;
    return { screenActive: participant.screenActive };
  };

  const cleanupCall = async (sessionId, reason = 'call_ended') => {
    const lease = calls.get(sessionId);
    if (!lease) return { playbacks: 0, publishers: 0 };
    let stoppedPlaybacks = 0;
    let stoppedPublishers = 0;
    for (const participant of lease.participants.values()) {
      for (const playback of participant.playbacks.values()) {
        try {
          await request(playbackPath(lease.meetingId, `/${encodeURIComponent(playback.playbackId)}`), {
            method: 'DELETE', body: { reason },
          });
          stoppedPlaybacks += 1;
        } catch { /* expiry/duplicate cleanup is already complete for this demo */ }
      }
    }
    for (const participant of lease.participants.values()) {
      if (!participant.publisher) continue;
      try {
        await request(sessionPath(lease.meetingId, `/${encodeURIComponent(participant.publisher.sessionId)}`), {
          method: 'DELETE', body: { reason },
        });
        stoppedPublishers += 1;
      } catch { /* expiry/duplicate cleanup is already complete for this demo */ }
    }
    calls.delete(sessionId);
    return { playbacks: stoppedPlaybacks, publishers: stoppedPublishers };
  };

  return {
    cleanupCall,
    hasCall: (sessionId) => calls.has(sessionId),
    preparePeerPlayback,
    preparePublisher,
    updatePresentation,
  };
}
