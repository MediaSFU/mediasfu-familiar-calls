# Familiar Calls for Kotlin / Android

A WhatsApp-style Android calling example built with Jetpack Compose and the
MediaSFU Kotlin SDK in headless mode. Users call a contact and accept or decline
an incoming call; they never copy a meeting ID or see a generic room form.

The app owns the product UI while MediaSFU owns realtime media. It includes:

- audio and video calls with a contact-style call history;
- screen-share-first, remote-camera-second media presentation;
- Android MediaProjection consent, foreground capture, publication, and camera restoration;
- a draggable, bounded mini preview;
- double-tap main/mini focus swapping when screen share is inactive;
- independent activation of every remote audio stream;
- a backend-only MediaSFU API credential boundary.

## Architecture and credential safety

All frontends in this repository use the same [`server`](../../server). The
Android app sends only its example user ID, contact ID, and call intent to that
backend. Only the backend stores `MEDIASFU_API_USERNAME` and
`MEDIASFU_API_KEY`; the app receives room-scoped create/join data.

For production, authenticate users and authorize contact access on the backend.
Never ship an account API key in an APK. The identity form in this sample is a
replaceable development convenience, not an authentication system.

Get MediaSFU Cloud credentials at
[MediaSFU developer console](https://mediasfu.com/documentation), explore authenticated
API calls in the [Sandbox](https://mediasfu.com/sandbox), and use the
[MediaSFU documentation](https://mediasfu.com/documentation) for SDK concepts.
MediaSFU Open means **your own already-running local MediaSFU server**; setting
a client URL does not install or start one.

## Run on an Android emulator

Requirements: JDK 17, Android SDK 35, and an API 26+ emulator. Start the shared
backend on port `8790`; the debug default `http://10.0.2.2:8790` reaches the host
machine from Android Emulator.

The app installs the published MediaSFU Android SDK from Maven Central:

```powershell
cd apps/kotlin-android
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```

To use another backend, add `-PcallBackendBaseUrl=https://calls.example.com`.
Use HTTPS outside local emulator development.

The debug APK is written to
`app/build/outputs/apk/debug/app-debug.apk`. Install it only on an emulator for
this repository's validation flow.

## Headless SDK boundary

`MainActivity.kt` configures `MediasfuGenericOptions(returnUI = false)` and
supplies backend create/join callbacks plus a Compose custom component. The
small `MediaPresentation.kt` adapter decides which prepared SDK streams become
primary and preview surfaces. It does not duplicate transport, room, producer,
consumer, or teardown logic.

Before distributing your app, build from a clean checkout and repeat the
two-participant media and cleanup test in your own non-production environment.

See the [two-person testing guide](../../docs/VALIDATION.md) and
[production-readiness checklist](../../docs/PROMOTION.md).
