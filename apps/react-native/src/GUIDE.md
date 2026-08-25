# Media calls guide

This example is a small phone app for starting and accepting MediaSFU calls.

## Important connection rule

This app uses MediaSFU Cloud through the backend proxy. The phone does not contain a MediaSFU username or API key. The backend keeps those secrets and calls MediaSFU for the app.

Because this is cloud mode, the app does not pass `localLink` anywhere.
`localLink` is for your own already-running self-hosted MediaSFU Open server. It
does not install or start that server and is not needed with MediaSFU Cloud.

The phone talks to the backend at the single value in `src/config.js`. Android emulators use `http://10.0.2.2:8787` to reach a backend running on the computer.

## How to use the app

1. Enter a user ID and a display name. The display name must be 2-10 letters or numbers, for example `Alex7`.
2. On the home screen, type the other person's user ID.
3. Choose video or audio, then press **Create call**.
4. The backend creates the MediaSFU room, saves the session details, and sends an invite to the other person's socket connection.
5. The other person sees the invite and presses **Accept**. **Decline** marks the session as declined through the backend.
6. During a call, use the custom controls for mute, video, and camera switching. Each control uses the headless action result to show success or a recoverable error. The current mobile client cannot initiate screen sharing; it can receive and display screen shares started by supported web clients.
7. Press **Workspace** to reveal the mounted `ModernMediasfuGeneric` workspace. MediaSFU's built-in whiteboard and other supported room tools are available there.
8. Press **End call** to leave the MediaSFU room and mark the backend session as ended.

Recording is not part of this example because the account is assumed not to have recording enabled. There is no Record button and the app does not call recording APIs. Call history means session metadata only: participants, meeting ID, status, timestamps, duration when available, and end reason. It never stores audio or video.

Screen sharing is receive-only in this mobile example. Do not treat the Android or iOS app as a screen-share initiator; use a supported web client to start a share when required.

## What the files do

- `App.js` manages onboarding, the home screen, incoming calls, backend sessions, the socket connection, and the mounted MediaSFU engine. It wires `useMediasfuHeadless()` to `ModernMediasfuGeneric` with a stable seed, every parameter publication, and `onMediaChanged`.
- `CallInterface.js` is the custom in-call screen. Its buttons use `room.controls`, and its video surfaces consume the current hook projection.
- `src/mediaPresentation.js` resolves screen share, remote cameras, local camera, state labels, and the complete independent audio collection without reading transport internals.
- `src/config.js` is the one backend URL location.
- `src/api.js` calls create, join, list, and end session endpoints. It never contains cloud credentials.
- `src/socket.js` registers the user and listens for invite, joined, and ended events.
- `src/storage.js` saves the identity on the phone.
- `src/validation.js` applies the user ID and MediaSFU display-name rules.

The backend is responsible for credentials, MediaSFU Cloud room requests, invite delivery, and persistent session metadata. It should be deployed behind HTTPS before a production release.

## Media display rules

- Active screen share is primary and uses contain fit; it is never mirrored.
- Remote camera is next, then the local camera.
- Only a local camera is mirrored.
- Remote video is not gated on the track's `muted` flag before first-frame decode.
- Ended screen tracks and disabled or ended local camera tracks fall back instead of painting black.
- Every `room.audioComponents` entry is mounted through `AudioGrid`, even if that participant is not visible.
- Read `room.parameters` after every publication. Do not hold an old parameter bag.

## Release verification

Use compatible released SDK versions from the public package registry. From a
clean checkout, rerun unit, lint, backend, Android build, two-client media, and
cleanup checks before distributing the app.
