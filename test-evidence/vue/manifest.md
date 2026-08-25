# Vue staging acceptance

Date: 2026-08-21
Environment: MediaSFU staging
Frontend: `http://127.0.0.1:4186` and `http://localhost:4186`
Shared backend: `http://127.0.0.1:8788`

## Observed

- The backend created a real staging room through its private server-side proxy.
- The second origin received and accepted the contact-call invitation.
- The backend session reached `active` and then `ended` during teardown.
- The caller SDK remained at `Waiting for the room name`; the recipient SDK
  remained at `Waiting for the MediaSFU media device` during the bounded wait.
- Production was not contacted or changed.

## Media result

SDK readiness, video production, remote video consumption, and remote audio
playout are **not verified**. The pending call screenshots are retained to make
the boundary observable rather than presenting it as a pass.

## Images

- `01-staging-incoming-call.png` — real backend invitation at the recipient.
- `02-staging-caller-sdk-pending.png` — caller readiness boundary.
- `03-staging-recipient-sdk-pending.png` — recipient readiness boundary.

The screenshots contain no API credential, room secret, meeting ID, or private
endpoint.
