# SDK-free WHIP/WHEP evidence

- Date: 2026-08-21 (America/Edmonton)
- App: `apps/whip-whep`
- MediaSFU client SDK: none
- Environments: local deterministic UI preview and authorized staging
- Live room: yes, for the retained `staging/` acceptance set
- Credentials retained: no

## Real staging acceptance

On 2026-08-21, two independent browser contexts completed a disposable
two-person staging call. The backend created the room over HTTP, the caller was
admitted as an owner-authorized external WHIP host, the recipient was admitted
as an external participant, both browsers published through WHIP, and each
browser played the peer through WHEP.

Both peer video elements reached `readyState = 4`, remained unpaused, and
decoded at 1280×720. The caller then swapped main/mini media and dragged the
mini preview from `(1035, 106)` to `(745, 240)`, with the element retaining its
210×131.25 size. HTTP end returned `ended` to both browsers and dependency-order
cleanup completed. The current producer PID logged no matching WHIP/WHEP
timeout or production error during the successful run.

Capture was a development-only canvas plus oscillator so the run is repeatable
without a physical camera or microphone. The room, authorization, WHIP offers,
WHEP offers, ICE/media transport, decoded peer video, and teardown were real
staging operations. This does not claim a human audibility check.

See `staging/manifest.json` for machine-readable measurements and SHA-256
checksums.

## Local UI preview

- The browser call surface keeps the remote source in the main stage and the
  local source in a labelled mini preview.
- Double activation swaps the main and mini sources.
- Pointer drag moves the mini preview while bounded-stage logic is covered by
  the executable protocol test suite.
- The shared backend provisions one WHIP publisher per participant and one WHEP
  peer playback through tested, in-memory protocol leases.
- Browser code contains no MediaSFU SDK import or reusable account credential.

## Files

- `01-sdk-free-remote-main-local-mini-preview.png`
- `02-sdk-free-double-activation-swap-preview.png`
- `03-sdk-free-mini-dragged-preview.png`

Every image is visibly marked `UI PREVIEW · SYNTHETIC · NOT LIVE`. These files
prove layout and interaction behavior only. They do not prove staging room
creation, WHIP admission, WHEP packet consumption, audible media, or teardown.
A real staging run is now retained separately under `staging/`; these preview
images remain useful only for deterministic layout comparison.

## Automated verification

- App protocol/interaction tests: 5/5 passed.
- Shared backend lifecycle/broker tests: 7/7 passed.
- Vite production build: passed.
