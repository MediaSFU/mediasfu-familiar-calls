import test from 'node:test';
import assert from 'node:assert/strict';
import { alignOfferToPayloadProfile, clampMiniOffset, parsePayloadProfile } from '../src/protocol.js';

test('parses and applies the backend WHEP payload profile', () => {
  const profile = parsePayloadProfile('audio/opus=111, video/VP8=120');
  const offer = [
    'v=0\r\n',
    'm=audio 9 UDP/TLS/RTP/SAVPF 96\r\n',
    'a=rtpmap:96 opus/48000/2\r\n',
    'm=video 9 UDP/TLS/RTP/SAVPF 97\r\n',
    'a=rtpmap:97 VP8/90000\r\n',
    'a=rtcp-fb:97 nack\r\n',
  ].join('');
  const aligned = alignOfferToPayloadProfile(offer, profile);
  assert.match(aligned, /m=audio .* 111/);
  assert.match(aligned, /a=rtpmap:111 opus/);
  assert.match(aligned, /m=video .* 120/);
  assert.match(aligned, /a=rtcp-fb:120 nack/);
});

test('clamps a dragged preview inside the measured call stage', () => {
  assert.deepEqual(
    clampMiniOffset({ x: -900, y: 900 }, { width: 360, height: 640 }, { width: 112, height: 154 }),
    { x: -234, y: 472 },
  );
});
