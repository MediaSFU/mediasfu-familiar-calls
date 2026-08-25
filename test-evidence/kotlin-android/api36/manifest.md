# Kotlin / Android API 36 acceptance

Captured 2026-08-21 on an Android API 36 emulator.

## Measured results

- `:app:testDebugUnitTest`: pass.
- `:app:lintDebug`: pass after declaring camera/microphone hardware optional
  and restricting cleartext traffic to debug builds.
- `:app:assembleDebug`: pass.
- Final debug APK size: 116,257,495 bytes.
- `adb install -r`: `Success`.
- Launcher activity resumed as
  `com.mediasfu.familiarcall.debug/com.mediasfu.familiarcall.MainActivity`.
- Onboarding rendered without a room or meeting-ID input.
- A non-secret example identity reached the contact-first **Chats & calls**
  screen, which offers video/audio calling by app user ID.

## Images

- [`02-onboarding.png`](02-onboarding.png): app-owned identity handoff and
  explicit backend-created-room explanation.
- [`03-contact-home.png`](03-contact-home.png): contact-first call controls and
  empty recent-call state.

These images prove APK installation, launch, and visible product navigation.
They do **not** prove a live room, media production, remote consumption,
double-tap focus swapping, or mini-preview dragging. Those require a separate
two-participant staging run and remain unverified.

No MediaSFU API credential, staging credential, room secret, or production
deployment value is present in this evidence.
