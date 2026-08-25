# React, Angular, and Vue WHIP/WHEP hosts

The React, Angular, and Vue projects each ship an alternate **SDK-free** entry
for the same familiar two-person call. These entries use the framework only to
own the page lifecycle. One browser core owns room-backend requests, WHIP
publishing, WHEP playback, media presentation, gestures, and cleanup.

This separation is intentional:

```text
React / Angular / Vue lifecycle host
                 │
                 ▼
shared familiar-call browser core
  ├─ contact-first HTTP call flow
  ├─ local capture and remote playback presentation
  ├─ bounded drag and double-activation swap
  └─ deterministic end/unmount cleanup
                 │
                 ▼
shared WHIP/WHEP protocol module
  ├─ SDP payload-profile alignment
  ├─ WHIP publish + resource DELETE
  └─ WHEP receive + resource DELETE
```

There is no `mediasfu-*` import in any WHIP/WHEP framework host. The existing
SDK example remains a separate entry in the same framework project so users can
compare the high-level SDK and standards-only approaches without duplicating
the product UI or transport implementation.

## Run a framework host

Start the repository's shared backend first. It must hold the MediaSFU account
credentials; never put an API key in a browser environment file or bundle.

```powershell
cd server
npm install
Copy-Item .env.example .env
# Add your MediaSFU settings only to this private, gitignored file.
npm start
```

Then choose one frontend:

| Framework | Command | Open |
| --- | --- | --- |
| React | `cd apps/react; npm run dev:whip-whep` | `http://127.0.0.1:4180/whip-whep.html` |
| Vue | `cd apps/vue; npm run dev:whip-whep` | `http://127.0.0.1:4181/whip-whep.html` |
| Angular | `cd apps/angular; npm run dev:whip-whep` | `http://127.0.0.1:4182` |

Open two independent browser contexts, choose different demo identities, then
call one user ID from the other. Users call a person; room IDs remain private
backend state. The alternate entries use `/api`, which each development server
proxies to `http://127.0.0.1:8790` by default.

## What is shared

- Both people publish their own audio and optional video through WHIP.
- Each person receives the other person's audio and video through WHEP.
- Remote media is primary and local media is the draggable mini preview.
- Double-click or double-tap swaps primary and mini media.
- A local screen share replaces the camera on the existing WHIP video sender,
  takes the primary surface, and disables swapping until sharing stops.
- Peer polling continues after WHEP is established so a remote screen share is
  rendered contained and primary, with swapping locked until the peer stops.
- The mini preview is clamped to the measured call stage.
- Ending or unmounting closes local tracks and peer connections; normal end
  also asks the backend to DELETE protocol resources and the temporary room.
- The backend provisions short-lived protocol leases. Account credentials never
  enter browser storage, source, logs, URLs, or screenshots.

For the complete protocol sequence, backend variables, Cloud versus self-hosted
MediaSFU Open guidance, production checklist, and retained two-browser evidence,
read the [main WHIP/WHEP guide](README.md).

## Build and verify

```powershell
cd apps/whip-whep
npm test

cd ../react
npm run build:whip-whep

cd ../vue
npm run build:whip-whep

cd ../angular
npm run build:whip-whep
```

The tests assert protocol behavior, bounded drag, the mount/unmount contract,
and that all three host adapters import the shared core rather than a MediaSFU
SDK. A successful build proves compilation and bundle generation. It does not
by itself prove camera/microphone permission, network traversal, decoded media,
or audible output; use the two-browser acceptance procedure in the main guide
for those claims.
