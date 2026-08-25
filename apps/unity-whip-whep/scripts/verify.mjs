import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
const read = (path) => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('Packages/manifest.json'));
const backend = read('Assets/Scripts/Backend/CallBackendClient.cs');
const protocol = read('Assets/Scripts/Media/WhipWhepProtocol.cs');
const presentation = read('Assets/Scripts/Presentation/MediaPresentation.cs');
const app = read('Assets/Scripts/FamiliarCallApp.cs');
const docs = read('README.md');
const allSource = [backend, protocol, presentation, app, docs, JSON.stringify(manifest)].join('\n');

const checks = [
  ['Unity WebRTC is the only real-time client dependency', () => {
    assert.equal(manifest.dependencies['com.unity.webrtc'], '3.0.0-pre.7');
    assert.equal(Object.keys(manifest.dependencies).some((name) => name.startsWith('com.mediasfu')), false);
  }],
  ['shared contact/session backend contract is used', () => {
    for (const route of [
      '/api/users/', '/api/protocol/calls/create', '/api/protocol/calls/accept',
      '/api/protocol/prepare', '/api/protocol/sessions/', '/api/sessions/'
    ]) assert.match(backend, new RegExp(route.replaceAll('/', '\\/')));
  }],
  ['WHIP and WHEP negotiate SDP, bearer leases, ICE, and DELETE teardown', () => {
    for (const token of [
      'CreateOffer()', 'SetLocalDescription', 'SetRemoteDescription', 'WaitForIce',
      'application/sdp', 'Bearer {token}', 'UnityWebRequest.Delete', 'SdpPayloadProfile.Align',
      'PreferredH264Payload'
    ]) assert.ok(protocol.includes(token), `missing ${token}`);
  }],
  ['every received audio track gets independent playout', () => {
    assert.match(protocol, /if \(track is AudioStreamTrack audio\)[\s\S]*source\.SetTrack\(audio\)/);
    assert.match(protocol, /remoteAudioSources\.Add\(source\)/);
  }],
  ['presentation is isolated and prioritizes screen then remote then local', () => {
    const priorities = ['MediaSurfaceKind.Screen', 'MediaSurfaceKind.RemoteCamera', 'MediaSurfaceKind.LocalCamera'];
    assert.deepEqual(priorities.map((value) => presentation.indexOf(value)), [...priorities.map((value) => presentation.indexOf(value))].sort((a, b) => a - b));
    assert.ok(presentation.includes('ClampMiniOffset'));
  }],
  ['call UI includes focus swap, draggable mini, and screen surface adapter', () => {
    for (const token of ['SetScreenShareTexture', 'EventType.MouseDrag', 'clickCount >= 2', 'focusedSurfaceId', 'miniOffset', 'primary.Kind != MediaSurfaceKind.Screen'])
      assert.ok(app.includes(token), `missing ${token}`);
  }],
  ['public source and docs contain no account credentials', () => {
    assert.doesNotMatch(allSource, /MEDIASFU_API_KEY\s*[=:]\s*["'][^"']+/i);
    assert.doesNotMatch(allSource, /[a-f0-9]{56,}(?:bg|[a-f0-9]{2})/i);
    assert.match(docs, /account\s+credentials stay on the backend/i);
  }],
  ['Unity assets and folders have stable committed metadata', () => {
    const assetPaths = [
      'Assets', 'Assets/Scripts', 'Assets/Scripts/Backend', 'Assets/Scripts/Media',
      'Assets/Scripts/Presentation', 'Assets/Tests', 'Assets/Tests/EditMode',
      'Assets/Scripts/MediaSFU.FamiliarCall.asmdef',
      'Assets/Scripts/FamiliarCallApp.cs',
      'Assets/Scripts/Backend/CallContracts.cs',
      'Assets/Scripts/Backend/CallBackendClient.cs',
      'Assets/Scripts/Media/WhipWhepProtocol.cs',
      'Assets/Scripts/Media/LocalMediaCapture.cs',
      'Assets/Scripts/Presentation/MediaPresentation.cs',
      'Assets/Tests/EditMode/MediaSFU.FamiliarCall.Tests.asmdef',
      'Assets/Tests/EditMode/MediaPresentationTests.cs',
      'Assets/Tests/EditMode/SdpPayloadProfileTests.cs'
    ];
    const guids = assetPaths.map((path) => {
      const meta = read(`${path}.meta`);
      const guid = /^guid: ([a-f0-9]{32})$/m.exec(meta)?.[1];
      assert.ok(guid, `invalid or missing metadata for ${path}`);
      return guid;
    });
    assert.equal(new Set(guids).size, guids.length, 'Unity metadata GUIDs must be unique');
  }]
];

let passed = 0;
for (const [name, check] of checks) {
  check();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}
console.log(`Unity SDK-free WHIP/WHEP contract: ${passed}/${checks.length} checks passed.`);
