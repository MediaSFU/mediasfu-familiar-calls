# iOS / SwiftUI

This folder is the native iOS port of the familiar-calls starter. It mirrors
the Android, Flutter, and React Native journey: local identity → contact call
creation/acceptance → MediaSFU room → mute, camera, screen share, and end.

## Add it to an app

1. Create an iOS 16+ SwiftUI target in Xcode.
2. Add the files in this folder to the target.
3. Add `https://github.com/MediaSFU/mediasfu-apple-sdk.git` as a Swift package
   dependency and link `MediaSFUAppleSDK` to the app target.
4. Add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the
   target's Info.plist.
5. Run the shared familiar-calls backend and set `CALL_API_ORIGIN` to its public
   origin when it is not available at the default development address.

The iOS app never needs an account API key. Its SDK wrapper supplies non-secret,
shape-valid placeholders to select the no-UI pre-join path. The backend creates
or joins the room, and the Apple SDK replaces those placeholders with the
returned room-scoped `roomName`, `secret`, and `link` before connecting the
socket. Keep account credentials in the backend's private environment.

On a physical iPhone, `127.0.0.1` refers to the phone. Use an HTTPS backend URL
that the device can reach and set `CALL_API_ORIGIN` in the scheme or app
configuration. Do not place credentials in that value.
