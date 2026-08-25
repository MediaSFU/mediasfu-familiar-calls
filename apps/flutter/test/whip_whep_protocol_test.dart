import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:mediasfu_familiar_call/whip_whep/protocol.dart';
import 'package:mediasfu_familiar_call/whip_whep/presentation.dart';

void main() {
  test('WHEP SDP is aligned with MediaSFU payload profile', () {
    const offer =
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 97\r\na=rtpmap:97 VP8/90000\r\n';
    final aligned = alignOfferToPayloadProfile(offer, {
      'audio/opus': 111,
      'video/vp8': 120,
    });
    expect(aligned, contains('m=audio 9 UDP/TLS/RTP/SAVPF 111'));
    expect(aligned, contains('a=rtpmap:111 opus/48000/2'));
    expect(aligned, contains('m=video 9 UDP/TLS/RTP/SAVPF 120'));
  });

  test('mini preview remains inside call stage', () {
    expect(
      clampProtocolMiniOffset(
        const Offset(-900, 900),
        const Size(360, 640),
        const Size(112, 154),
      ),
      const Offset(-234, 472),
    );
  });
}
