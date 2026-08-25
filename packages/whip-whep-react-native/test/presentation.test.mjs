import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProtocolMedia } from '../src/presentation.js';

const stream = kinds => ({
  getTracks: () => kinds.map(kind => ({ kind, readyState: 'live' })),
});

test('keeps remote audio independent from camera focus', () => {
  const localStream = stream(['audio', 'video']);
  const remoteStream = stream(['audio', 'video']);
  const result = resolveProtocolMedia({ localStream, remoteStream, remotePrimary: true });
  assert.equal(result.primary.stream, remoteStream);
  assert.equal(result.mini.stream, localStream);
  assert.equal(result.remoteAudioStream, remoteStream);
  assert.equal(result.canSwap, true);
});

test('screen owns the stage and disables camera focus swap', () => {
  const screenStream = stream(['video']);
  const result = resolveProtocolMedia({
    localStream: stream(['video']), remoteStream: stream(['audio', 'video']), screenStream, remotePrimary: false,
  });
  assert.equal(result.primary.stream, screenStream);
  assert.equal(result.screenActive, true);
  assert.equal(result.canSwap, false);
});

test('peer screen metadata turns the WHEP video into the locked primary surface', () => {
  const remoteStream = stream(['audio', 'video']);
  const result = resolveProtocolMedia({ localStream: stream(['video']), remoteStream, remoteScreenActive: true });
  assert.equal(result.primary.stream, remoteStream);
  assert.equal(result.primary.kind, 'screen');
  assert.equal(result.canSwap, false);
});

test('ended tracks never become presentation surfaces', () => {
  const ended = { getTracks: () => [{ kind: 'video', readyState: 'ended' }] };
  assert.equal(resolveProtocolMedia({ localStream: ended }).primary, null);
});
