# Familiar Calls for iOS

This folder contains the native SwiftUI version of Familiar Calls. It follows
the same flow as the Android, Flutter, React, and React Native apps: choose an
identity, start or accept a contact call, join the MediaSFU room, control media,
and end the call.

## Requirements

- Xcode with an iOS 16 or newer app target
- The Familiar Calls backend from this repository
- The [MediaSFU Apple SDK](https://github.com/MediaSFU/mediasfu-apple-sdk)

## Add the app to an Xcode project

1. Add the Swift files in this folder to your app target.
2. In Xcode, choose **File → Add Package Dependencies**, enter the Apple SDK
   repository URL above, and link `MediaSFUAppleSDK` to the app target.
3. Add these keys to the app's Info.plist:

   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Use your camera during calls.</string>
   <key>NSMicrophoneUsageDescription</key>
   <string>Use your microphone during calls.</string>
   <key>CADisableMinimumFrameDurationOnPhone</key>
   <true/>
   ```

4. Start the Familiar Calls backend. The simulator uses
   `http://127.0.0.1:8790` by default. To use another backend, set the
   `CALL_API_ORIGIN` scheme environment variable to its origin.
5. Build and run. Create two identities on separate clients, place a call, and
   accept it from the other client.

`CALL_API_ORIGIN` identifies the Familiar Calls application backend, not a
MediaSFU room endpoint. Standard MediaSFU cloud routing needs no endpoint
override or `localLink` in this app. Keep MediaSFU account credentials on the
backend; the app receives the room-scoped values it needs after call setup.

For a physical iPhone, use an HTTPS backend URL reachable from the phone.
`127.0.0.1` on the phone does not refer to the development Mac.

## Media behavior

The included room view supports microphone, camera, screen share, remote-track
rendering, and call cleanup. Camera orientation is handled by the native Apple
media path for both direct camera capture and processed-video features.
