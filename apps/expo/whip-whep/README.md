# Expo WHIP/WHEP familiar calls

This is a standards-only Expo entry: it uses `react-native-webrtc` for WHIP and
WHEP and does not import a MediaSFU client SDK. It shares the tested transport,
presentation resolver, and call UI in `packages/whip-whep-react-native` with
the bare React Native entry.

Expo Go cannot run this app because Expo Go does not include
`react-native-webrtc`. Use an Android/iOS development build:

```powershell
cd apps/expo/whip-whep
npm install
npx expo prebuild
npx expo run:android
```

The checked-in package intentionally contains no cloud credentials. Start the
repository's shared backend on port `8790`; Android emulators reach it through
`10.0.2.2`. Use an HTTPS backend URL in production.

The media stage keeps remote audio mounted independently from video layout,
puts screen content first, supports a bounded draggable mini camera, enables
double-activation focus swap only when no screen is active, and cleans up WHEP
before WHIP. See the shared package tests for protocol and presentation checks.

The source supports `getDisplayMedia` sender replacement and the backend's
peer-presentation signal. A real Expo development build still has to prove the
platform screen-capture prompt; Expo Go cannot validate it.
