# Flutter WHIP/WHEP call entry

`lib/whip_whep_main.dart` is the standards-only alternative to the SDK-powered
Flutter entry. Its reachable call engine uses `flutter_webrtc`, WHIP, WHEP,
and the repository's shared backend contract; it does not import or call the
MediaSFU Flutter SDK.

Run it on the Android emulator with:

```powershell
cd apps/flutter
flutter pub get
flutter test test/whip_whep_protocol_test.dart
flutter analyze lib/whip_whep_main.dart lib/whip_whep
flutter run -t lib/whip_whep_main.dart
```

The Android emulator uses `http://10.0.2.2:8790`. Override it for another
environment without committing credentials:

```powershell
flutter run -t lib/whip_whep_main.dart --dart-define=CALL_API_ORIGIN=https://calls.example.com
```

Only use HTTPS in production. MediaSFU account credentials belong in the
shared backend, never in `--dart-define`, source, screenshots, or app storage.

The call presentation is separate from transport. It keeps peer audio active
independently of which video is visible, uses the backend's peer-presentation
signal to prioritize screen content, disables
camera focus swapping while a screen is active, supports double-tap focus swap
and a bounded draggable mini camera, and tears down WHEP before WHIP.

Screen capture uses `getDisplayMedia`, replaces the active WHIP video sender,
and publishes `screenActive`. The Android MediaProjection prompt and each iOS
screen-broadcast configuration still require validation in a real target build;
successful analysis or unit tests do not prove native screen capture.
