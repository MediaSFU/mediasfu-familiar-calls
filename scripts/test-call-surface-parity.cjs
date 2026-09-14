const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const contracts = [
  {
    name: 'React',
    source: read('apps', 'react', 'App.tsx'),
    required: ['clampMiniOffset', 'onDoubleClick={swapFocus}', 'onPointerMove={moveMini}', 'screenActive', 'AudioGrid componentsToRender={room.audioComponents}', 'onMediaChanged={room.onMediaChanged}'],
  },
  {
    name: 'Angular',
    source: read('apps', 'angular', 'src', 'app', 'app.component.ts') + read('apps', 'angular', 'src', 'app', 'app.component.html'),
    required: ['measurePreview', '(dblclick)="swapFocus()"', '(pointermove)="moveMini($event)"', 'screenActive', 'app-audio-grid'],
  },
  {
    name: 'Vue',
    source: read('apps', 'vue', 'App.vue'),
    required: ['clampMiniOffset', '@dblclick.prevent="swapFocus"', '@pointermove="moveMini"', 'screenActive', 'AudioGrid'],
  },
  {
    name: 'Flutter',
    source: read('apps', 'flutter', 'lib', 'main.dart'),
    required: ['_clampMini', 'onDoubleTap: swapFocus', 'onPanUpdate:', 'screenActive', 'getAudioGridComponents'],
  },
  {
    name: 'React Native',
    source: read('apps', 'react-native', 'CallInterface.js'),
    required: ['clampMiniOffset', 'Double-tap to swap video focus', 'PanResponder.create', 'const screen =', 'AudioGrid'],
  },
  {
    name: 'Expo',
    source: read('apps', 'expo', 'CallInterface.js'),
    required: ['clampMiniOffset', 'Double-tap to swap video focus', 'PanResponder.create', 'const screen =', 'AudioGrid'],
  },
  {
    name: 'Kotlin Android',
    source: read('apps', 'kotlin-android', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'MainActivity.kt')
      + read('apps', 'kotlin-android', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'ScreenCaptureForegroundService.kt')
      + read('apps', 'kotlin-android', 'app', 'src', 'main', 'AndroidManifest.xml')
      + read('apps', 'kotlin-android', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'MediaPresentation.kt'),
    required: ['resolveMediaPresentation', 'clampMiniOffset', 'detectTapGestures(onDoubleTap', 'detectDragGestures', 'screenActive', 'allAudioStreams', 'requestScreenCapturePermission', 'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'ACCESS_NETWORK_STATE'],
  },
  {
    name: 'WHIP/WHEP (no SDK)',
    source: read('apps', 'whip-whep', 'src', 'main.js') + read('apps', 'whip-whep', 'src', 'protocol.js'),
    required: ['clampMiniOffset', 'wireDoubleActivation', "mini.addEventListener('pointermove'", 'state.remotePrimary = !state.remotePrimary', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'React WHIP/WHEP host (no SDK)',
    source: read('apps', 'react', 'src', 'WhipWhepHost.tsx') + read('apps', 'whip-whep', 'src', 'main.js'),
    required: ['mountFamiliarCall', 'data-framework-host="react"', 'wireDoubleActivation', 'remoteScreenActive', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'Angular WHIP/WHEP host (no SDK)',
    source: read('apps', 'angular', 'src', 'whip-whep', 'whip-whep-host.component.ts') + read('apps', 'whip-whep', 'src', 'main.js'),
    required: ['mountFamiliarCall', 'data-framework-host="angular"', 'ngOnDestroy', 'remoteScreenActive', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'Vue WHIP/WHEP host (no SDK)',
    source: read('apps', 'vue', 'src', 'WhipWhepHost.vue') + read('apps', 'whip-whep', 'src', 'main.js'),
    required: ['mountFamiliarCall', 'data-framework-host="vue"', 'onBeforeUnmount', 'remoteScreenActive', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'React Native WHIP/WHEP (no SDK)',
    source: read('apps', 'react-native', 'WhipWhepApp.js')
      + read('packages', 'whip-whep-react-native', 'src', 'FamiliarWhipWhepApp.js')
      + read('packages', 'whip-whep-react-native', 'src', 'nativeTransport.js')
      + read('packages', 'whip-whep-react-native', 'src', 'presentation.js'),
    required: ['FamiliarWhipWhepApp', 'PanResponder.create', 'const activateSwap', 'remoteScreenActive', 'toggleScreen', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'Expo WHIP/WHEP (no SDK)',
    source: read('apps', 'expo', 'whip-whep', 'index.js')
      + read('packages', 'whip-whep-react-native', 'src', 'FamiliarWhipWhepApp.js')
      + read('packages', 'whip-whep-react-native', 'src', 'nativeTransport.js'),
    required: ['registerRootComponent', 'FamiliarWhipWhepApp', 'PanResponder.create', 'remoteScreenActive', 'toggleScreen', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'Flutter WHIP/WHEP (no SDK)',
    source: read('apps', 'flutter', 'lib', 'whip_whep_main.dart')
      + read('apps', 'flutter', 'lib', 'whip_whep', 'presentation.dart')
      + read('apps', 'flutter', 'lib', 'whip_whep', 'protocol.dart'),
    required: ['resolveProtocolPresentation', 'onDoubleTap: _doubleActivate', 'onPanUpdate:', 'screenActive', 'publishWhip', 'consumeWhep'],
  },
  {
    name: 'Kotlin Android WHIP/WHEP (no SDK)',
    source: read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'protocol', 'MainActivity.kt')
      + read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'protocol', 'MediaPresentation.kt')
      + read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'protocol', 'WhipWhepClient.kt')
      + read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'protocol', 'BackendApi.kt')
      + read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'java', 'com', 'mediasfu', 'familiarcall', 'protocol', 'ScreenCaptureForegroundService.kt')
      + read('apps', 'kotlin-android-whip-whep', 'app', 'src', 'main', 'AndroidManifest.xml'),
    required: ['resolvePresentation', 'GestureDetector.SimpleOnGestureListener', 'override fun onDoubleTap', 'override fun onScroll', 'setOnTouchListener', 'screenActive', 'RemoteMedia', 'sdpRequest(resourceUrl, token, "DELETE")', 'ScreenCapturerAndroid', 'replaceVideoTrack', 'updatePresentation', 'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'ACCESS_NETWORK_STATE'],
  },
  {
    name: 'Unity WHIP/WHEP (no SDK)',
    source: read('apps', 'unity-whip-whep', 'Assets', 'Scripts', 'FamiliarCallApp.cs')
      + read('apps', 'unity-whip-whep', 'Assets', 'Scripts', 'Media', 'WhipWhepProtocol.cs')
      + read('apps', 'unity-whip-whep', 'Assets', 'Scripts', 'Presentation', 'MediaPresentation.cs'),
    required: ['MediaPresentationResolver.Resolve', 'ClampMiniOffset', 'EventType.MouseDrag', 'clickCount >= 2', 'SetScreenShareTexture', 'remoteAudioSources.Add', 'UnityWebRequest.Delete'],
  },
];

const reactPackage = JSON.parse(read('apps', 'react', 'package.json'));
assert.equal(
  reactPackage.dependencies['mediasfu-reactjs'],
  '4.3.3',
  'React must retain the retry-safe MediaSFU consumer lifecycle',
);

for (const contract of contracts) {
  for (const token of contract.required) {
    assert.ok(contract.source.includes(token), `${contract.name} is missing ${token}`);
  }
}

console.log(`call-surface parity: ${contracts.length}/${contracts.length} app surfaces passed`);
