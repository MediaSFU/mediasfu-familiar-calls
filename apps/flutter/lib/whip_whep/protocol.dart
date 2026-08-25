import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'protocol_api.dart';

const whepProfileHeader = 'x-mediasfu-rtp-payload-types';

Map<String, int> parsePayloadProfile(String? value) {
  final result = <String, int>{};
  for (final entry in (value ?? '').split(',')) {
    final pair = entry.trim().split('=');
    final payloadType = pair.length == 2 ? int.tryParse(pair[1]) : null;
    if (pair.length == 2 && pair[0].isNotEmpty && payloadType != null) {
      result[pair[0].toLowerCase()] = payloadType;
    }
  }
  return result;
}

List<int> _codecPayloads(String section, String mimeType) {
  final codec = mimeType.toLowerCase().split('/').last;
  return RegExp(
        r'^a=rtpmap:(\d+)\s+([^/\s]+)/\d+(?:/\d+)?\s*$',
        multiLine: true,
        caseSensitive: false,
      )
      .allMatches(section)
      .where((match) => match.group(2)?.toLowerCase() == codec)
      .map((match) => int.parse(match.group(1)!))
      .toList();
}

int? _choosePayload(String section, String mimeType) {
  final payloads = _codecPayloads(section, mimeType);
  if (mimeType != 'video/h264') return payloads.firstOrNull;
  final packetized = payloads.where((payloadType) {
    final fmtp =
        RegExp(
          '^a=fmtp:$payloadType\\s+([^\\r\\n]+)\$',
          multiLine: true,
          caseSensitive: false,
        ).firstMatch(section)?.group(1) ??
        '';
    return RegExp(
      r'(?:^|;)packetization-mode=1(?:;|$)',
      caseSensitive: false,
    ).hasMatch(fmtp);
  }).toList();
  return packetized
      .firstWhere((payloadType) {
        final fmtp =
            RegExp(
              '^a=fmtp:$payloadType\\s+([^\\r\\n]+)\$',
              multiLine: true,
              caseSensitive: false,
            ).firstMatch(section)?.group(1) ??
            '';
        return fmtp.toLowerCase().contains('profile-level-id=42e');
      }, orElse: () => packetized.firstOrNull ?? payloads.firstOrNull ?? -1)
      .takeIf((value) => value >= 0);
}

extension _TakeIf<T> on T {
  T? takeIf(bool Function(T value) predicate) => predicate(this) ? this : null;
}

String _remapPayload(String section, String mimeType, int target) {
  final assignment = RegExp(
    '^a=rtpmap:$target\\s+([^/\\s]+)/',
    multiLine: true,
    caseSensitive: false,
  ).firstMatch(section)?.group(1)?.toLowerCase();
  final codec = mimeType.split('/').last;
  if (assignment == codec) return section;
  if (assignment != null) {
    throw StateError(
      'WHEP payload type $target is already assigned to $assignment.',
    );
  }
  final source = _choosePayload(section, mimeType);
  if (source == null || source == target) return section;
  final mLineMatch = RegExp(
    r'^m=([^\r\n]+)$',
    multiLine: true,
    caseSensitive: false,
  ).firstMatch(section);
  if (mLineMatch == null) return section;
  final mLine = mLineMatch.group(0)!;
  final fields = mLine.split(RegExp(r'\s+'));
  final index = fields.indexOf('$source');
  if (index < 0) return section;
  fields[index] = '$target';
  section = section.replaceFirst(mLine, fields.join(' '));
  section = section.replaceAllMapped(
    RegExp(
      '^(a=(?:rtpmap|fmtp|rtcp-fb):)$source(?=[ \\r]|\$)',
      multiLine: true,
      caseSensitive: false,
    ),
    (match) => '${match.group(1)}$target',
  );
  return section.replaceAllMapped(
    RegExp(
      '(\\bapt=)$source(?=;|\\s|\$)',
      multiLine: true,
      caseSensitive: false,
    ),
    (match) => '${match.group(1)}$target',
  );
}

String alignOfferToPayloadProfile(String sdp, Map<String, int> profile) {
  if (profile.isEmpty) {
    throw StateError('The WHEP endpoint omitted its RTP payload profile.');
  }
  const supported = {
    'audio/opus',
    'audio/pcmu',
    'audio/pcma',
    'video/vp8',
    'video/vp9',
    'video/h264',
  };
  return sdp.split(RegExp(r'(?=m=)')).map((part) {
    var section = part;
    final kind = RegExp(
      r'^m=(audio|video)\s',
      multiLine: true,
      caseSensitive: false,
    ).firstMatch(section)?.group(1)?.toLowerCase();
    if (kind == null) return section;
    for (final entry in profile.entries) {
      if (supported.contains(entry.key) && entry.key.startsWith('$kind/')) {
        section = _remapPayload(section, entry.key, entry.value);
      }
    }
    return section;
  }).join();
}

Future<void> _waitForIce(
  RTCPeerConnection peer, {
  Duration timeout = const Duration(seconds: 12),
}) async {
  if (peer.iceGatheringState ==
      RTCIceGatheringState.RTCIceGatheringStateComplete) {
    return;
  }
  final completer = Completer<void>();
  peer.onIceGatheringState = (state) {
    if (state == RTCIceGatheringState.RTCIceGatheringStateComplete &&
        !completer.isCompleted) {
      completer.complete();
    }
  };
  await completer.future.timeout(
    timeout,
    onTimeout: () => throw TimeoutException('WebRTC ICE gathering timed out.'),
  );
}

class ProtocolResource {
  final RTCPeerConnection peer;
  final String resourceUrl;
  final String token;
  final http.Client client;
  final MediaStream? stream;
  ProtocolResource(
    this.peer,
    this.resourceUrl,
    this.token,
    this.client, {
    this.stream,
  });

  Future<void> stop() async {
    try {
      await client.delete(
        Uri.parse(resourceUrl),
        headers: {'authorization': 'Bearer $token'},
      );
    } catch (_) {}
    await peer.close();
    for (final track in stream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await track.stop();
    }
  }
}

Future<ProtocolResource> publishWhip({
  required String url,
  required String token,
  required MediaStream stream,
  required http.Client client,
}) async {
  final peer = await createPeerConnection({'bundlePolicy': 'max-bundle'});
  try {
    for (final track in stream.getTracks()) {
      await peer.addTrack(track, stream);
    }
    final offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await _waitForIce(peer);
    final local = await peer.getLocalDescription();
    final response = await client.post(
      Uri.parse(url),
      headers: {
        'authorization': 'Bearer $token',
        'content-type': 'application/sdp',
      },
      body: local?.sdp ?? offer.sdp,
    );
    if (response.statusCode != 201) {
      throw StateError('WHIP publish was refused (${response.statusCode}).');
    }
    final location = response.headers['location'];
    if (location == null || location.isEmpty) {
      throw StateError('WHIP publish response omitted its resource URL.');
    }
    await peer.setRemoteDescription(
      RTCSessionDescription(response.body, 'answer'),
    );
    return ProtocolResource(
      peer,
      Uri.parse(url).resolve(location).toString(),
      token,
      client,
    );
  } catch (_) {
    await peer.close();
    rethrow;
  }
}

Future<ProtocolResource> consumeWhep({
  required String url,
  required String token,
  required List<String> tracks,
  required http.Client client,
  required VoidCallback onTrack,
}) async {
  final peer = await createPeerConnection({'bundlePolicy': 'max-bundle'});
  final stream = await createLocalMediaStream('whep-remote');
  peer.onTrack = (event) {
    if (!stream.getTracks().any((track) => track.id == event.track.id)) {
      stream.addTrack(event.track).then((_) => onTrack());
    } else {
      onTrack();
    }
  };
  try {
    for (final kind in tracks) {
      await peer.addTransceiver(
        kind: kind == 'audio'
            ? RTCRtpMediaType.RTCRtpMediaTypeAudio
            : RTCRtpMediaType.RTCRtpMediaTypeVideo,
        init: RTCRtpTransceiverInit(direction: TransceiverDirection.RecvOnly),
      );
    }
    final profileResponse = await client.get(Uri.parse(url));
    if (profileResponse.statusCode < 200 || profileResponse.statusCode >= 300) {
      throw StateError(
        'WHEP profile request failed (${profileResponse.statusCode}).',
      );
    }
    final offer = await peer.createOffer();
    final aligned = alignOfferToPayloadProfile(
      offer.sdp ?? '',
      parsePayloadProfile(profileResponse.headers[whepProfileHeader]),
    );
    await peer.setLocalDescription(RTCSessionDescription(aligned, 'offer'));
    await _waitForIce(peer);
    final local = await peer.getLocalDescription();
    final response = await client.post(
      Uri.parse(url),
      headers: {
        'authorization': 'Bearer $token',
        'content-type': 'application/sdp',
      },
      body: local?.sdp ?? aligned,
    );
    if (response.statusCode != 201) {
      throw StateError('WHEP playback was refused (${response.statusCode}).');
    }
    final location = response.headers['location'];
    if (location == null || location.isEmpty) {
      throw StateError('WHEP playback response omitted its resource URL.');
    }
    await peer.setRemoteDescription(
      RTCSessionDescription(response.body, 'answer'),
    );
    return ProtocolResource(
      peer,
      Uri.parse(url).resolve(location).toString(),
      token,
      client,
      stream: stream,
    );
  } catch (_) {
    await peer.close();
    rethrow;
  }
}

class FlutterWhipWhepTransport extends ChangeNotifier {
  final ProtocolApi api;
  final http.Client mediaClient;
  MediaStream? localStream;
  MediaStream? remoteStream;
  MediaStream? remoteVideoStream;
  MediaStream? screenStream;
  bool remoteScreenActive = false;
  ProtocolResource? publisher;
  ProtocolResource? playback;
  String phase = 'Idle';
  String error = '';
  bool _cancelled = false;

  FlutterWhipWhepTransport(this.api, {http.Client? mediaClient})
    : mediaClient = mediaClient ?? http.Client();

  void _publish(String value, [Object? problem]) {
    phase = value;
    error = problem?.toString().replaceFirst('Exception: ', '') ?? '';
    notifyListeners();
  }

  void reportError(String value, Object problem) => _publish(value, problem);

  Future<void> start(
    ProtocolSession session,
    String userId,
    String displayName,
  ) async {
    _cancelled = false;
    try {
      _publish('Requesting microphone and camera…');
      localStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': session.callType == 'audio'
            ? false
            : {
                'facingMode': 'user',
                'width': {'ideal': 1280},
                'height': {'ideal': 720},
                'frameRate': 30,
              },
      });
      notifyListeners();
      _publish('Publishing with WHIP…');
      final prepared = await api.preparePublisher(
        session.id,
        userId,
        displayName,
      );
      final publisherData = Map<String, dynamic>.from(
        prepared['publisher'] as Map,
      );
      publisher = await publishWhip(
        url: '${publisherData['url']}',
        token: '${publisherData['token']}',
        stream: localStream!,
        client: mediaClient,
      );
      while (!_cancelled) {
        final result = await api.preparePeer(session.id, userId);
        remoteScreenActive =
            (result['peerPresentation'] as Map?)?['screenActive'] == true;
        if (result['ready'] != true) {
          _publish(
            result['reason'] == 'peer_media_not_active'
                ? 'Contact media is connecting…'
                : 'Ringing…',
          );
          await Future<void>.delayed(const Duration(seconds: 1));
          continue;
        }
        if (playback == null) {
          final playbackData = Map<String, dynamic>.from(
            result['playback'] as Map,
          );
          playback = await consumeWhep(
            url: '${playbackData['url']}',
            token: '${playbackData['token']}',
            tracks: ((playbackData['tracks'] as List?) ?? const [])
                .map((item) => '$item')
                .toList(),
            client: mediaClient,
            onTrack: () {
              remoteStream = playback?.stream;
              unawaited(_refreshRemoteVideo());
              _publish('Live');
            },
          );
          remoteStream = playback!.stream;
          await _refreshRemoteVideo();
        }
        _publish('Live');
        await Future<void>.delayed(const Duration(seconds: 1));
      }
    } catch (problem) {
      if (!_cancelled) _publish('Connection issue', problem);
      rethrow;
    }
  }

  Future<void> _refreshRemoteVideo() async {
    final source = remoteStream;
    if (source == null) return;
    remoteVideoStream ??= await createLocalMediaStream('whep-remote-video');
    final existing = remoteVideoStream!
        .getTracks()
        .map((track) => track.id)
        .toSet();
    for (final track in source.getVideoTracks()) {
      if (!existing.contains(track.id)) {
        await remoteVideoStream!.addTrack(track);
      }
    }
    notifyListeners();
  }

  bool toggleAudio() {
    final tracks = localStream?.getAudioTracks() ?? const <MediaStreamTrack>[];
    final enabled = !tracks.any((track) => track.enabled);
    for (final track in tracks) {
      track.enabled = enabled;
    }
    notifyListeners();
    return enabled;
  }

  bool toggleVideo() {
    final tracks = localStream?.getVideoTracks() ?? const <MediaStreamTrack>[];
    final enabled = !tracks.any((track) => track.enabled);
    for (final track in tracks) {
      track.enabled = enabled;
    }
    notifyListeners();
    return enabled;
  }

  Future<bool> toggleScreen(String sessionId, String userId) async {
    final sender = (await publisher?.peer.getSenders())
        ?.where((item) => item.track?.kind == 'video')
        .firstOrNull;
    if (screenStream != null) {
      await api.updatePresentation(sessionId, userId, false);
      await sender?.replaceTrack(localStream?.getVideoTracks().firstOrNull);
      for (final track in screenStream!.getTracks()) {
        await track.stop();
      }
      screenStream = null;
      _publish('Live');
      return false;
    }
    if (sender == null) {
      throw StateError(
        'The active WHIP publisher has no replaceable video sender.',
      );
    }
    final display = await navigator.mediaDevices.getDisplayMedia({
      'video': true,
      'audio': false,
    });
    final screenTrack = display.getVideoTracks().firstOrNull;
    if (screenTrack == null) {
      throw StateError('Screen capture returned no video track.');
    }
    await sender.replaceTrack(screenTrack);
    try {
      await api.updatePresentation(sessionId, userId, true);
    } catch (_) {
      await sender.replaceTrack(localStream?.getVideoTracks().firstOrNull);
      for (final track in display.getTracks()) {
        await track.stop();
      }
      rethrow;
    }
    screenStream = display;
    screenTrack.onEnded = () {
      if (screenStream == display) {
        unawaited(toggleScreen(sessionId, userId));
      }
    };
    _publish('Live');
    return true;
  }

  Future<void> stop() async {
    _cancelled = true;
    final currentPlayback = playback;
    final currentPublisher = publisher;
    playback = null;
    publisher = null;
    if (currentPlayback != null) await currentPlayback.stop();
    if (currentPublisher != null) await currentPublisher.stop();
    for (final track
        in localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await track.stop();
    }
    for (final track
        in screenStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await track.stop();
    }
    localStream = null;
    remoteStream = null;
    remoteVideoStream = null;
    screenStream = null;
    remoteScreenActive = false;
    _publish('Idle');
  }

  @override
  void dispose() {
    unawaited(stop());
    mediaClient.close();
    super.dispose();
  }
}
