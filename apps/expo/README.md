# Expo familiar-call app

A runnable Expo 57 / React Native 0.86 client for the repository's shared
WhatsApp-style calling backend. Users choose a local example identity, call a
contact, and accept or decline an incoming call. They never type a meeting ID
or receive reusable MediaSFU credentials.

The custom call screen uses `ModernMediasfuGeneric` with `returnUI={false}` and
`useMediasfuHeadless`. It adopts every parameter publication, wires
`onMediaChanged`, resolves screen share before remote camera before local
camera, and keeps the complete `AudioGrid` mounted. Microphone, camera,
camera-switch, MediaSFU workspace, and leave/end controls remain app-owned.

## Run

Start the repository's shared backend first (the default port is 8790), then:

```bash
npm install
npm start
```

Expo Go is not sufficient because the MediaSFU SDK depends on native WebRTC
modules. Use an Expo development build for native Android/iOS acceptance:

```bash
npm run android
```

Use an Android emulator, never a physical validation device. For a backend on
the development computer, either use the Android default `10.0.2.2:8790` or set
`EXPO_PUBLIC_CALL_API_ORIGIN` to a reachable backend origin. This variable is
only the public proxy origin—API username/key values belong in `server/`.

Web is useful supplemental validation:

```powershell
$env:EXPO_PUBLIC_CALL_API_ORIGIN='http://127.0.0.1:8790'
npm run web -- --port 4176
npm run export:web
```

Web proof does not prove native camera/audio routing, background behavior, or
native teardown. The 2026-08-21 staging run proved two separate web identities,
server-side room creation, invitation, accept/join, SDK connection, and ended
history. Camera/audio production was not observed in the in-app browser, so the
evidence manifest deliberately leaves produce/consume unverified.

Before distributing the app, use compatible released versions of
`mediasfu-reactnative-expo` and `mediasfu-shared`, then validate it from a clean
install.
