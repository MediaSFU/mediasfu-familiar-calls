import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repoRoot = path.resolve(root, '..', '..');

test('is SDK-free and retains the familiar two-person call interactions', () => {
  const dependencies = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
  assert.equal(Object.keys(dependencies).some((name) => /mediasfu|mediasoup|webrtc/i.test(name)), false);
  for (const token of [
    'publishWhip',
    'consumeWhep',
    'wireDoubleActivation',
    'clampMiniOffset',
    "mini.addEventListener('pointermove'",
    'state.remotePrimary = !state.remotePrimary',
    'state.remoteScreenActive',
    'presentation.swapLocked',
    'navigator.mediaDevices.getDisplayMedia',
    'await sender.replaceTrack(screenTrack)',
    'await publishScreenState(true)',
    '/presentation',
    "payload.data.peerPresentation?.screenActive === true",
    'video.classList.toggle(\'screen\', screen)',
    "root.querySelector('#main-label').textContent = 'Your screen'",
    'navigator.mediaDevices.getUserMedia',
    "query.get('validation') === 'staging'",
    'createStagingValidationStream',
    'real staging WHIP/WHEP transport',
    '/api/protocol/calls/accept',
  ]) assert.ok(source.includes(token), `missing interaction contract: ${token}`);
  assert.equal(source.includes('meeting ID'), true);
});

test('exports a scoped mount lifecycle for thin framework hosts', () => {
  for (const token of [
    'export function mountFamiliarCall(element)',
    "root.querySelector('.home-shell')",
    "window.removeEventListener('beforeunload', releasePageResources)",
    'window.clearInterval(pollInterval)',
    'window.clearTimeout(state.peerTimer)',
    'releasePageResources()',
    'root.replaceChildren()',
  ]) assert.ok(source.includes(token), `missing host lifecycle contract: ${token}`);
  assert.equal(source.includes("document.querySelector('.home-shell')"), false);
});

test('React, Angular, and Vue hosts reuse the core without importing an SDK', () => {
  const hosts = [
    ['react', 'apps/react/src/WhipWhepHost.tsx'],
    ['angular', 'apps/angular/src/whip-whep/whip-whep-host.component.ts'],
    ['vue', 'apps/vue/src/WhipWhepHost.vue'],
  ];
  for (const [framework, file] of hosts) {
    const hostSource = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.match(hostSource, /mountFamiliarCall/);
    assert.doesNotMatch(hostSource, /from ['"]mediasfu-/i, `${framework} host imports an SDK`);
    assert.match(hostSource, /unmount/);
  }
});
