# React Native familiar-call implementation guide

This project is a small WhatsApp-style calling app built with React Native and MediaSFU. It provides a simple path to create a call, invite another user, join the room, use the main call controls, and end the call.

## How the pieces fit together

### Why there is a backend proxy

The mobile app should not contain the MediaSFU Cloud API username or API key.
The shared server in `../../server/` keeps those values private and performs the
room API requests for every frontend in this repository. It also gives the apps
one place to manage invitations, joining, ending calls, and recent-call
metadata.

The included JSON storage is suitable for a sample or prototype. For production, replace it with authenticated users, durable database storage, HTTPS, rate limiting, monitoring, and access control.

### Identities and user IDs

Each person has:

- A stable `userId` used for lookup, invitations, and authorization.
- A short `displayName` shown in the call UI and passed to MediaSFU.

The current validation expects a user ID made from letters, numbers, `_`, or `-`, and a display name containing 2-10 letters or numbers. Use the user ID when inviting someone; do not use a display name as the routing identity.

## The call flow

1. The user enters their own user ID and display name.
2. The caller enters the other person's user ID and selects video or audio.
3. The app calls `POST /api/rooms/create` through the backend.
4. The backend creates the MediaSFU room, saves a safe session record, and sends a socket invitation to the target user.
5. The recipient presses **Accept**. The app calls `POST /api/rooms/join`.
6. Both clients mount MediaSFU and exchange media through the room.
7. Either participant can mute, turn video on or off, switch cameras, open the workspace, or end the call.
8. Ending a call updates the session record. Recent calls contain metadata only, not audio or video.

The room duration and capacity are currently defined in `App.js` as five minutes and two participants. Change them there when the product flow requires different defaults.

## MediaSFU engine and custom UI

`ModernMediasfuGeneric` is the MediaSFU engine under the app. It handles room state, transports, permissions, media actions, built-in workspace tools, and SDK callbacks.

`CallInterface.js` is the custom presentation layer. It gives the app its own header, status, action buttons, media stage, call timer, and end-call action while still calling the SDK methods underneath. `src/mediaPresentation.js` is the pure projection between the headless SDK state and that view. This separation lets the product change its visual design without rewriting room or transport logic.

The **Workspace** button opens the mounted MediaSFU workspace. Use it for built-in tools such as the whiteboard and other supported room features. The app intentionally does not seed a room with `useSeed` or `seedData`; rooms are created and joined through the normal cloud flow.

## Media rendering details

`useMediasfuHeadless()` owns the parameter bridge. Pass its stable `sourceParameters` seed, `updateSourceParameters`, and `onMediaChanged` callback to `ModernMediasfuGeneric`. Read the hook's latest `parameters` and projections after each publication; do not remember a previously published parameter bag and do not call the publishing `getUpdatedAllParams()` as if it were a getter.

The custom media stage uses:

- `room.screenShare` for a live local or remote screen. A screen takes the main stage, is never mirrored, and is fit with `contain` so its edges remain visible.
- `room.remoteVideos` for remote cameras. The SDK helper merges `oldAllStreams` and `allVideoStreams`, removes the self marker, checks track liveness, and deduplicates producers.
- `room.localVideo` for the truthful self-view, including a processed virtual-background stream when active.
- `room.audioComponents` for every prepared audio element. The full collection is always mounted through `AudioGrid`, independently from the visible video selection.
- `room.participants`, `room.micOn`, and `room.cameraOn` for participant-facing media-state labels.

The selection order is screen share, remote camera, then local camera. A remote track is attached even while its `muted` flag is true before first-frame decode; gating attachment on that flag creates a playback deadlock. Dead screen tracks and disabled or ended local camera tracks are rejected so they do not become black primary video.

Double-tap the main or mini camera to swap focus when both people have cameras. Drag the mini preview to move it; its position is clamped inside the measured stage. While a screen share is active, it remains primary and both cameras move to previews.

## Controls and current limits

- **Mute / Unmute** calls `room.controls.toggleMic()`.
- **Video on / Video off** calls `room.controls.toggleCamera()`.
- **Switch cam** calls `room.controls.flipCamera()`.
- **Workspace** opens the MediaSFU workspace.
- **End call** leaves the room and closes the application session.

Each headless action returns `{ ok, error }`. The call interface reports a useful message when an action is not ready or fails instead of silently ignoring the request.

The current React Native SDK client does not initiate Android or iOS screen sharing. The mobile app therefore does not show a misleading screen-share button. A supported web participant may start a screen share, and the mobile client receives it through `room.screenShare`.

Recording is intentionally not part of this example. The app assumes recording is disabled and does not call recording APIs or store media.

## Setup and run

1. Install the mobile dependencies from `apps/react-native`:

   ```powershell
   npm install
   ```

2. Install the backend dependencies:

   ```powershell
   cd ../../server
   npm install
   Copy-Item .env.example .env
   ```

3. Edit `../../server/.env` with your own MediaSFU Cloud credentials. Keep this file private and never commit it.

4. Start the backend from `server`:

   ```powershell
   npm start
   ```

5. In another terminal, start Metro and the app:

   ```powershell
   npm start
   npm run android
   ```

   iOS builds require macOS and Xcode. From the project root, run `npx react-native run-ios` for an iOS simulator or connected device. Android emulators use `http://10.0.2.2:8787` to reach a backend running on the development computer. A physical phone needs the computer's LAN address in `src/config.js` and must be on the same network.

6. Open the app on two devices or emulators. Give each person a different user ID, create a call from one device, and accept it on the other.

Useful checks:

```powershell
npm test
npm run lint
```

Run `npm test` separately from `server/` to validate the shared backend.

Before distributing your app, use compatible released SDK versions from the
public registry, reinstall from a clean checkout, rerun the checks above plus
the Android build, and verify the complete two-client call surface.

## Files to edit first

- `src/config.js`: backend URL for the selected device or emulator.
- `../../server/.env`: private MediaSFU Cloud credentials and server settings.
- `App.js`: onboarding, call duration/capacity, create/join flow, and workspace mounting.
- `CallInterface.js`: custom call layout, controls, gestures, labels, and visual styling.
- `src/mediaPresentation.js`: pure screen/remote/local selection, liveness checks, deduplication, and audio retention.
- `ShellIcon.js`: Material Community Icons used by the app shell.
- `src/api.js`: client calls to the backend endpoints.
- `../../server/src/server.js`: backend routes, socket events, validation, and persistence behavior.
- `../../server/data/sessions.json`: development-only session history; do not use this file as production storage.

Avoid editing `node_modules`. If an SDK behavior needs to change, first check whether the public SDK props, callbacks, or overrides provide the intended extension point.

## Production checklist

- Put the backend behind HTTPS and use a production domain.
- Store MediaSFU credentials only in a secret manager or protected server environment.
- Add real login and authorization; do not trust a user ID sent by an unauthenticated client.
- Replace JSON files with durable, protected storage.
- Restrict `CORS_ORIGIN` to the actual client origins.
- Add rate limits, request validation, monitoring, and structured error handling.
- Set room duration and capacity deliberately for the product.
- Test camera and microphone permissions on real Android and iOS devices.
- Decide separately whether screen sharing or recording is required and use an SDK/platform path that supports it.
- Remove development URLs, sample identities, and debug logging before release.

## Troubleshooting

**The app says it is offline.** Confirm the backend is running, check `src/config.js`, and verify that the phone can reach the computer. Android emulators use `10.0.2.2`; physical phones use the computer's LAN IP.

**The invitation does not appear.** Confirm both users have different IDs, both apps are connected to the same backend, and the recipient registered its socket presence before the call was created.

**The room opens but video is missing.** Check camera permission, turn video on, and confirm the device has a usable camera source. Then inspect the current headless projection: `room.localVideo`, `room.remoteVideos`, and `room.screenShare`. Do not diagnose from an old parameter object.

**The local preview is black.** An emulator can report an active camera track while producing black frames. Configure the emulator camera input, and confirm the projected track is live and enabled.

**A name is rejected.** Use a short alphanumeric display name such as `Alex7`. Use the separate `userId` field for routing and invitations.

**Screen sharing is unavailable on mobile.** This is a current React Native SDK limitation for initiating a share. Start the share from a supported web client instead; mobile can receive it when available.

**The workspace is not visible.** Press **Workspace** after the room is connected. It is mounted through `ModernMediasfuGeneric`; it is not a separate room or a second backend connection.
