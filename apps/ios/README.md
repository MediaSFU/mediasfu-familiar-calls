# iOS / SwiftUI

This folder is the native iOS port of the familiar-calls starter. It mirrors
the Android, Flutter, and React Native journey: local identity → contact call
creation/acceptance → MediaSFU room → mute, camera, screen share, and end.

Add the files in this folder to an iOS 16+ Xcode app and add the Swift package
`https://github.com/MediaSFU/mediasfu-apple-sdk.git` (version `0.1.5` or later).
Add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the app's
Info.plist. Set `CALL_API_ORIGIN` to the URL of the familiar-calls backend.

The app reads `MEDIASFU_API_USERNAME`, `MEDIASFU_API_KEY`, and the optional
`MEDIASFU_CLOUD_ROOMS_ENDPOINT` only from the launch environment. Production
apps should keep credentials on the backend proxy and pass room-scoped data to
the SDK; no credential or environment-specific endpoint belongs in this repo.
