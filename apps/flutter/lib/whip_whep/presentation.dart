import 'dart:ui';
import 'package:flutter_webrtc/flutter_webrtc.dart';

enum ProtocolSurfaceKind { camera, screen }

class ProtocolSurface {
  final ProtocolSurfaceKind kind;
  final MediaStream stream;
  final bool isLocal;
  final String label;
  const ProtocolSurface({
    required this.kind,
    required this.stream,
    required this.isLocal,
    required this.label,
  });
}

class ProtocolPresentation {
  final ProtocolSurface? primary;
  final ProtocolSurface? mini;
  final List<ProtocolSurface> extras;
  final MediaStream? remoteAudioStream;
  final bool canSwap;
  final bool screenActive;
  const ProtocolPresentation({
    required this.primary,
    required this.mini,
    required this.extras,
    required this.remoteAudioStream,
    required this.canSwap,
    required this.screenActive,
  });
}

bool _hasLiveTrack(MediaStream? stream, String kind) =>
    stream?.getTracks().any((track) => track.kind == kind) ?? false;

ProtocolPresentation resolveProtocolPresentation({
  MediaStream? localStream,
  MediaStream? remoteStream,
  MediaStream? remoteAudioStream,
  MediaStream? screenStream,
  bool remoteScreenActive = false,
  bool remotePrimary = true,
}) {
  final screenSource = _hasLiveTrack(screenStream, 'video')
      ? (stream: screenStream!, isLocal: true, label: 'Your screen')
      : remoteScreenActive && _hasLiveTrack(remoteStream, 'video')
      ? (stream: remoteStream!, isLocal: false, label: "Contact's screen")
      : null;
  final screen = screenSource != null
      ? ProtocolSurface(
          kind: ProtocolSurfaceKind.screen,
          stream: screenSource.stream,
          isLocal: screenSource.isLocal,
          label: screenSource.label,
        )
      : null;
  final local = _hasLiveTrack(localStream, 'video')
      ? ProtocolSurface(
          kind: ProtocolSurfaceKind.camera,
          stream: localStream!,
          isLocal: true,
          label: 'You',
        )
      : null;
  final remote = !remoteScreenActive && _hasLiveTrack(remoteStream, 'video')
      ? ProtocolSurface(
          kind: ProtocolSurfaceKind.camera,
          stream: remoteStream!,
          isLocal: false,
          label: 'Contact',
        )
      : null;
  final cameras = remotePrimary ? [remote, local] : [local, remote];
  final surfaces = <ProtocolSurface?>[
    screen,
    ...cameras,
  ].whereType<ProtocolSurface>().toList();
  return ProtocolPresentation(
    primary: surfaces.firstOrNull,
    mini: surfaces.length > 1 ? surfaces[1] : null,
    extras: surfaces.length > 2 ? surfaces.sublist(2) : const [],
    remoteAudioStream: _hasLiveTrack(remoteAudioStream ?? remoteStream, 'audio')
        ? (remoteAudioStream ?? remoteStream)
        : null,
    canSwap: screen == null && local != null && remote != null,
    screenActive: screen != null,
  );
}

Offset clampProtocolMiniOffset(
  Offset offset,
  Size stage,
  Size preview, {
  double gap = 14,
}) {
  final baseLeft = (stage.width - preview.width - gap).clamp(
    0.0,
    double.infinity,
  );
  return Offset(
    offset.dx.clamp(-baseLeft, gap),
    offset.dy.clamp(
      -gap,
      (stage.height - preview.height - gap).clamp(-gap, double.infinity),
    ),
  );
}
