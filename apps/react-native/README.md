# MediaSFU familiar calls for React Native

This is the complete React Native 0.86 implementation of the repository's
WhatsApp-style calling flow. Users choose an app identity and a contact, then
place or accept an audio/video call. They never see a meeting-ID create/join
screen: the shared backend creates and joins the MediaSFU room invisibly.

## What is implemented

- `ModernMediasfuGeneric` runs headlessly with `returnUI={false}`.
- `useMediasfuHeadless()` exposes live streams, participants, readiness and
  controls to the custom call screen.
- The stage selects an active screen share first, then a remote camera, then
  the local camera. Only a normal local camera is mirrored.
- Every remote audio renderer stays mounted even when its participant is not
  the primary video.
- Mute, camera, camera-switch, workspace and leave actions use the hook's
  current parameter bag and surface errors in the call UI.
- The React Native 0.86 host explicitly enables Metro in debug builds through
  `useDevSupport = BuildConfig.DEBUG`.

The mobile sample cannot initiate screen sharing. It can receive and display a
screen share produced by a supported web client.

## Run the shared backend

From the repository root:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Add your MediaSFU API username and API key to the backend-only `.env`, then:

```powershell
npm start
```

The public default is MediaSFU Cloud. Get API credentials at
[MediaSFU developer console](https://mediasfu.com/documentation), explore room requests in
the [MediaSFU Sandbox](https://mediasfu.com/sandbox), and read the
[MediaSFU documentation](https://mediasfu.com/documentation).

The app never contains an API key. Android emulators reach the shared backend
at `http://10.0.2.2:8787`; change `src/config.js` for another development host.
Add real authentication, authorization, HTTPS, rate limiting and managed
storage before shipping the teaching backend.

## Run the app

```powershell
cd apps/react-native
npm install
npm start
```

In another terminal:

```powershell
npm run android
```

Use two Android emulators. Give each client a different user ID, enter the
other user's ID, choose audio or video, and accept the incoming call. iOS
requires macOS, Xcode and CocoaPods.

## Headless integration

`App.js` owns the MediaSFU bridge while `CallInterface.js` owns the product UI:

```jsx
const room = useMediasfuHeadless();

<ModernMediasfuGeneric
  returnUI={false}
  sourceParameters={room.sourceParameters}
  updateSourceParameters={room.updateSourceParameters}
  onMediaChanged={room.onMediaChanged}
  noUIPreJoinOptions={preJoinOptions}
  createMediaSFURoom={createMediaSFURoom}
  joinMediaSFURoom={joinMediaSFURoom}
/>
```

The backend callbacks return room-scoped MediaSFU responses. The application
adopts every source-parameter publication; controls resolve the latest bag at
invocation time rather than holding a stale snapshot.

## Validate

```powershell
npm test -- --runInBand
npm run lint
```

Native media claims additionally require two-emulator runtime evidence. The
retained staging screenshots and exact limitation are documented in
[`../../test-evidence/react-native`](../../test-evidence/react-native). A
successful JavaScript test or Metro bundle is not proof of camera capture,
remote decoding or audio playout.

Before a public release, install compatible published SDK versions from the
normal package registry and repeat installation, tests, lint, Android build,
two-client media, and teardown from a clean checkout.

## MediaSFU Open

[MediaSFU Open](https://github.com/MediaSFU/MediaSFUOpen) is a MediaSFU server
that you run and operate yourself. A client `localLink` only points at an
already-running server; it does not install, start, configure or secure one.

For the detailed file flow, media projection and production checklist, see
[`implementation guide`](INTEGRATION_GUIDE.md) and [`source guide`](src/GUIDE.md).
