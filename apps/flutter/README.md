# Flutter familiar-call app

A runnable Android/Web Flutter client for the repository's shared WhatsApp-style
call backend. It provides identity onboarding, contact calling, incoming
accept/decline, history, and an app-owned call surface. Meeting IDs remain
infrastructure state and never appear as user input.

## Run

Start `server/` on port 8790. For Web:

```bash
flutter run -d chrome --web-port 4174
```

For an Android emulator:

```bash
adb -s emulator-5554 reverse tcp:8790 tcp:8790
flutter run -d emulator-5554 --dart-define=CALL_API_ORIGIN=http://127.0.0.1:8790
```

Change the emulator ID if needed. A physical device must use a backend URL that
it can reach over HTTPS or the local network. The app sends only session
payloads to `/api`; reusable MediaSFU credentials stay private in the shared
backend.

`ModernMediasfuGeneric(returnUI: false)` feeds every publication to
`MediasfuHeadlessController`. Rendering uses screen share → remote camera →
local camera; screens are unmirrored, local camera is mirrored, all prepared
audio widgets remain mounted, controls wait for readiness, and teardown leaves
MediaSFU before closing the application session.

For a public release, use a compatible published `mediasfu_sdk` constraint and
verify a clean package resolution.

## Verification status

The implementation passes focused tests and static analysis, and its Android
debug build installs and launches on an API 36 emulator. The retained evidence
does not yet cover a live two-participant Flutter media session. Complete that
acceptance check before distributing a production application. See the
[Android launch evidence](../../test-evidence/flutter/android-api36/manifest.md)
for the exact boundary of the current validation.
