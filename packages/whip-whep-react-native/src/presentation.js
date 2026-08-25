function liveTrack(stream, kind) {
  return stream?.getTracks?.().some(track => track.kind === kind && track.readyState !== 'ended') || false;
}

export function resolveProtocolMedia({ localStream, remoteStream, screenStream, remoteScreenActive = false, remotePrimary = true }) {
  const screenSource = liveTrack(screenStream, 'video')
    ? { stream: screenStream, isLocal: true, label: 'Your screen' }
    : remoteScreenActive && liveTrack(remoteStream, 'video')
      ? { stream: remoteStream, isLocal: false, label: "Contact's screen" }
      : null;
  const screen = screenSource
    ? { kind: 'screen', ...screenSource }
    : null;
  const local = liveTrack(localStream, 'video')
    ? { kind: 'camera', stream: localStream, isLocal: true, label: 'You' }
    : null;
  const remote = !remoteScreenActive && liveTrack(remoteStream, 'video')
    ? { kind: 'camera', stream: remoteStream, isLocal: false, label: 'Contact' }
    : null;
  const cameras = remotePrimary ? [remote, local] : [local, remote];
  const surfaces = [screen, ...cameras].filter(Boolean);
  return {
    primary: surfaces[0] || null,
    mini: surfaces[1] || null,
    extras: surfaces.slice(2),
    remoteAudioStream: liveTrack(remoteStream, 'audio') ? remoteStream : null,
    canSwap: !screen && Boolean(local && remote),
    screenActive: Boolean(screen),
  };
}
