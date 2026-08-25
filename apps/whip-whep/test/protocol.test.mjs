import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignOfferToPayloadProfile,
  clampMiniOffset,
  consumeWhep,
  parsePayloadProfile,
  publishWhip,
  resolveScreenPresentation,
} from '../src/protocol.js';

const offerSdp = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 109',
  'a=rtpmap:109 opus/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 102',
  'a=rtpmap:102 H264/90000',
  'a=fmtp:102 packetization-mode=1;profile-level-id=42e01f',
  '',
].join('\r\n');

class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  addTrack(track) { this.tracks.push(track); }
}

class FakePeer {
  constructor() {
    this.iceGatheringState = 'complete';
    this.localDescription = null;
    this.remoteDescription = null;
    this.listeners = new Map();
    this.added = [];
    this.transceivers = [];
    this.closed = false;
  }
  addTrack(track) { this.added.push(track); }
  addTransceiver(kind, options) { this.transceivers.push({ kind, options }); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener() {}
  async createOffer() { return { type: 'offer', sdp: offerSdp }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  close() { this.closed = true; }
}

test('aligns browser payload types to the MediaSFU WHEP profile', () => {
  const profile = parsePayloadProfile('audio/opus=111,video/h264=125');
  const aligned = alignOfferToPayloadProfile(offerSdp, profile);
  assert.match(aligned, /m=audio 9 UDP\/TLS\/RTP\/SAVPF 111/);
  assert.match(aligned, /a=rtpmap:111 opus\/48000\/2/);
  assert.match(aligned, /m=video 9 UDP\/TLS\/RTP\/SAVPF 125/);
  assert.match(aligned, /a=fmtp:125 packetization-mode=1/);
});

test('publishes captured tracks with WHIP bearer auth and deletes its resource', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'DELETE') return new Response('', { status: 200 });
    return new Response('v=0\r\n', {
      status: 201,
      headers: { location: '/whip/room/session/resource', 'content-type': 'application/sdp' },
    });
  };
  const handle = await publishWhip({
    url: 'https://media.example.test/whip/room/session',
    token: 'short-lived-whip',
    stream: new FakeStream([{ kind: 'audio' }, { kind: 'video' }]),
    fetchImpl,
    PeerConnection: FakePeer,
  });
  assert.equal(handle.peer.added.length, 2);
  assert.equal(requests[0].options.headers.authorization, 'Bearer short-lived-whip');
  assert.equal(requests[0].options.headers['content-type'], 'application/sdp');
  await handle.stop();
  assert.equal(requests[1].url, 'https://media.example.test/whip/room/session/resource');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(handle.peer.closed, true);
});

test('preflights, aligns, and opens WHEP receive-only playback', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') {
      return new Response(null, {
        status: 204,
        headers: { 'x-mediasfu-rtp-payload-types': 'audio/opus=111,video/h264=125' },
      });
    }
    if (options.method === 'DELETE') return new Response('', { status: 200 });
    return new Response('v=0\r\n', {
      status: 201,
      headers: { location: '/whep/room/playback/resource', 'content-type': 'application/sdp' },
    });
  };
  const video = { srcObject: null, play: async () => {} };
  const handle = await consumeWhep({
    url: 'https://edge.example.test/whep/room/playback',
    token: 'short-lived-whep',
    tracks: ['audio', 'video'],
    video,
    fetchImpl,
    PeerConnection: FakePeer,
    Stream: FakeStream,
  });
  assert.deepEqual(handle.peer.transceivers, [
    { kind: 'audio', options: { direction: 'recvonly' } },
    { kind: 'video', options: { direction: 'recvonly' } },
  ]);
  assert.match(requests[1].options.body, /a=rtpmap:111 opus/);
  assert.match(requests[1].options.body, /a=rtpmap:125 H264/);
  assert.equal(requests[1].options.headers.authorization, 'Bearer short-lived-whep');
  await handle.stop();
  assert.equal(requests[2].options.method, 'DELETE');
});

test('clamps the draggable mini preview inside the measured stage', () => {
  assert.deepEqual(
    clampMiniOffset({ x: -1000, y: 1000 }, { width: 800, height: 600 }, { width: 180, height: 120 }),
    { x: -606, y: 466 },
  );
});

test('keeps screens primary, contained, and swap-locked with remote priority', () => {
  assert.deepEqual(
    resolveScreenPresentation({ localScreenActive: false, remoteScreenActive: false }),
    { primary: null, fit: 'cover', swapLocked: false },
  );
  assert.deepEqual(
    resolveScreenPresentation({ localScreenActive: true, remoteScreenActive: false }),
    { primary: 'local-screen', fit: 'contain', swapLocked: true },
  );
  assert.deepEqual(
    resolveScreenPresentation({ localScreenActive: true, remoteScreenActive: true }),
    { primary: 'remote-screen', fit: 'contain', swapLocked: true },
  );
});
