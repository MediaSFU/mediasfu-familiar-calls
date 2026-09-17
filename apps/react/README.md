# React familiar-call example

This app uses `ModernMediasfuGeneric` with `returnUI={false}` and
`useMediasfuHeadless()` to present a purpose-built contact calling experience.
It does not show MediaSFU's create-room or meeting-ID join screen.

Start the shared backend, then this app on port `4174`:

```powershell
cd server
npm start

cd ../apps/react
npm install
npm run dev
```

Open two browser tabs. Identity is stored in `sessionStorage`, so each tab can
onboard as a different user. Enter the second tab's user ID in the first, choose
audio or video, and call. The recipient's polling loop displays an incoming call
to accept or decline. The backend performs MediaSFU create and join operations.

The custom call screen resolves screen share → remote camera → local camera and
mounts `<AudioGrid componentsToRender={room.audioComponents} />` separately.
It also forwards `onMediaChanged={room.onMediaChanged}` to the headless engine,
so late and replaced audio consumers are republished into that single audio
grid. The React starter pins `mediasfu-reactjs` 4.3.4 or newer for the bounded
consumer-device wait and retry-safe reservation lifecycle.
Only a normal local camera is mirrored. **Test media** publishes an animated
canvas into the real MediaSFU room for deterministic two-participant acceptance;
it is not a mock room or a replacement for WebRTC evidence.

For a public release, install a compatible published `mediasfu-reactjs` version
from the normal package registry and verify a clean installation.

## Standards-only alternative

This project also builds `/whip-whep.html`, a React lifecycle host for the
shared browser WHIP/WHEP implementation. That entry imports no MediaSFU client
SDK. Run `npm run dev:whip-whep`, then open
`http://127.0.0.1:4180/whip-whep.html`. See the public
[framework-host guide](../whip-whep/FRAMEWORK_HOSTS.md) for architecture,
security, behavior, and validation.
