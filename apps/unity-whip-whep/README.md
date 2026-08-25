# WhatsApp-style Unity call with WHIP and WHEP

This Unity sample makes a private two-person audio or video call without a
MediaSFU client SDK. A user chooses a demo identity, calls another user ID, and
accepts an incoming call. Meeting IDs and room credentials never appear in the
call UI.

Unity publishes captured media with **WHIP** and plays the other participant
with **WHEP**. The repository's shared backend creates the MediaSFU room and
returns short-lived, participant-scoped protocol leases. MediaSFU account
credentials stay on the backend.

## Included experience

- Contact-first outgoing, incoming, decline, accept, recent-call, and end flows.
- Local camera and reciprocal remote video surfaces.
- Remote-first presentation with a draggable mini self-view.
- Double-click or double-tap to swap the main and mini surfaces.
- Screen-share-first presentation when a host game supplies a screen texture.
- Independent playback for every received remote audio track.
- Explicit DELETE of WHEP and WHIP resources, followed by backend call cleanup.
- SDP payload-profile alignment required by MediaSFU WHEP.

This is the protocol counterpart to the SDK-based apps in this repository. It
does **not** import `mediasfu-unity` or another MediaSFU SDK. Unity's official
WebRTC package supplies only the WebRTC primitives.

## Architecture

```text
FamiliarCallApp (contact flow + Unity rendering)
        |
        +-- MediaPresentationResolver (pure main/mini/screen priority)
        |
        +-- CallBackendClient ---- shared backend ---- MediaSFU room API
        |                                  |
        +-- WhipWhepProtocol <-------------+
                 | short-lived leases
                 +-- WHIP: local audio/video publish
                 +-- WHEP: peer audio/video playback
```

The boundaries are intentional:

- `Backend/` owns JSON and HTTP call/session operations.
- `Media/` owns capture, SDP, WHIP, WHEP, remote audio, and protocol teardown.
- `Presentation/` is a pure surface-selection policy with no network or UI code.
- `FamiliarCallApp.cs` owns the familiar call UI and gestures.

`SetScreenShareTexture(texture)` lets a larger Unity application provide a
Unity-rendered share surface. That surface becomes primary automatically. Native
operating-system desktop capture and publication vary by target platform and
are not claimed by this focused sample.

## Requirements

- Unity `2022.3.62f3` or a compatible Unity 2022.3 LTS Editor.
- A desktop player supported by `com.unity.webrtc` `3.0.0-pre.7`.
- The repository's `server` running on port `8790`.
- Two independent players or one player and another compatible WHIP/WHEP client.
- Camera and microphone permission on the target device.

The project creates its UI at runtime, so no scene setup is required.

## Run locally

1. Configure and start the shared backend. Keep API details in its private,
   gitignored `.env`; never put them in this Unity project.

   ```powershell
   cd server
   npm install
   Copy-Item .env.example .env
   # Add your MediaSFU settings to .env.
   npm test
   npm start
   ```

2. Add `apps/unity-whip-whep` in Unity Hub and open it with Unity 2022.3 LTS.
   Unity resolves `com.unity.webrtc` from the package manifest.

3. Press Play. Use two independent clients, choose different user IDs, and call
   the other person. The user sees a contact call—not a create/join-room screen.

Desktop players default to `http://127.0.0.1:8790`. Android players default to
`http://10.0.2.2:8790`, which reaches the host from the Android emulator. A
desktop player can override the backend without changing source:

```powershell
FamiliarCall.exe --call-backend http://127.0.0.1:8790
```

Use HTTPS for deployed clients and authenticate users in the backend. The demo
user ID is a routing identity, not production authentication.

## MediaSFU Cloud and MediaSFU Open

- **MediaSFU Cloud** is the managed service. Get API details through the
  [MediaSFU developer console](https://mediasfu.com/documentation), exercise
  room APIs in the [Sandbox](https://mediasfu.com/sandbox), and use the
  [MediaSFU documentation](https://mediasfu.com/documentation).
- **MediaSFU Open** is a media server that **you install, configure, and run** on
  your own infrastructure. Pointing this sample at a URL does not install or
  start it. Your deployment must expose compatible room, external-session,
  WHIP, playback, and WHEP endpoints. Start with
  [MediaSFU Open](https://github.com/MediaSFU/MediaSFUOpen).

The room API and external-media origin configured in the backend must always
select the same environment.

## Validation

The source contract can be checked without Unity:

```powershell
cd apps\unity-whip-whep
npm test
```

With a Unity Editor installed, run the EditMode tests in `Assets/Tests/EditMode`.
They cover screen/remote/local presentation priority, placeholder rejection,
bounded mini movement, and WHEP SDP payload alignment.

Real acceptance needs two independent clients in one temporary room and must
prove all of the following:

1. Each client has an active WHIP publisher.
2. Each client receives decoded peer video over WHEP.
3. Remote audio is audible on both sides.
4. Double activation swaps main and mini media.
5. The mini view remains bounded after dragging.
6. Ending the call removes protocol resources and the backend session.

Retain credential-free screenshots and a validation manifest at:

```text
test-evidence/unity-whip-whep/staging/
  01-unity-live-remote-main.png
  02-peer-live-unity-main.png
  03-unity-media-swapped.png
  04-unity-mini-dragged.png
  manifest.json
```

Do not create these files from a static preview. They are evidence only after a
real player call. The current machine must have a working Unity Editor/player
before Editor compilation, live media, and screenshots can be claimed.

## Production checklist

- Authenticate and authorize both participants in the backend.
- Keep account credentials server-side and protocol leases short-lived.
- Serve the client and backend over HTTPS; restrict allowed origins.
- Add expiry, persistence, rate limits, abuse controls, and observability.
- Test camera/microphone denial, lease expiry, disconnect, end, and cleanup.
- Verify every target platform supported by the selected Unity WebRTC package.
