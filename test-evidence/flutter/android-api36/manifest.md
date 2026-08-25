# Flutter public-SDK Android launch check

- Date: 2026-08-21 (America/Edmonton)
- Device: `Medium_Phone_API_36`, API 36 x86_64 emulator (`emulator-5554`)
- SDK source: local public `mediasfu_sdk` path dependency
- Production contacted: no
- Credentials retained: no

## Proven

- `flutter build apk --debug` completed successfully.
- The resulting debug APK installed successfully on the approved API 36 emulator.
- Android launched `com.mediasfu.examples.mediasfu_familiar_call` and kept the process alive.
- `public-sdk-launch.png` is an emulator screenshot of the running application.

## Not claimed

This is a compile/install/launch check, not live-room acceptance. The external
staging validation environment used for an earlier run had already been removed,
as intended, and no credential-bearing file was recreated for this check.
Therefore this evidence does not claim staging room creation, media production,
media consumption, or teardown.
