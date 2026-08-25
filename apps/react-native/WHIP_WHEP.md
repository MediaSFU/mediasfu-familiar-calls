# React Native WHIP/WHEP call entry

This alternate entry keeps the existing familiar contact flow while replacing
the MediaSFU SDK engine with standards-only WHIP publishing and WHEP playback.
Only the shared backend receives MediaSFU account credentials. The phone gets
short-lived, participant-scoped protocol resources.

## Run the focused checks

```powershell
cd apps/react-native
npm run lint:whip-whep
npm run bundle:whip-whep:android
cd ../../packages/whip-whep-react-native
npm test
```

The Android emulator reaches the backend at `http://10.0.2.2:8790`. iOS uses
`http://127.0.0.1:8790`. Update `WhipWhepApp.js` to use the public HTTPS backend
before shipping. Never put a MediaSFU API key in this app.

`index.whip-whep.js` is deliberately separate from the SDK entry. Point the
React Native build's entry file at it (`ENTRY_FILE=index.whip-whep.js` on
Android release builds) to produce a bundle whose reachable media code has no
MediaSFU client SDK imports.

The call stage gives local or peer-signaled screen media priority, mounts remote audio in its own
sink, supports a bounded draggable mini view, swaps local/remote focus on
double activation when no screen is active, and releases WHEP before WHIP on
teardown.

Screen capture calls the native WebRTC runtime's `getDisplayMedia`, replaces
the active WHIP video sender, and publishes `screenActive` through the backend.
Android's MediaProjection prompt and iOS broadcast-extension requirements must
be validated in the target native build; a successful Metro bundle alone does
not prove screen capture.
