# Angular staging acceptance

Date: 2026-08-21
Environment: MediaSFU staging
Frontend: `http://127.0.0.1:4185` and `http://localhost:4185`
Shared backend: `http://127.0.0.1:8788`

## Observed

- The backend created a real staging room through its private server-side proxy.
- A separate recipient origin received the contact-call invitation and accepted it.
- Both Angular call surfaces reported **2 connected**.
- Both application sessions ended and the backend history reported `ended`.
- Production was not contacted or changed.

## Media result

No remote video or audio consumption is claimed. Before the deterministic
canvas attempt, the DOM contained no `<video>` or `<audio>` media element. The
`room.produce.canvas()` attempt did not settle within the bounded browser run,
so there is no produced/consumed media proof in this folder.

## Images

- `02-staging-incoming-call-current.png` — current-credential incoming call.
- `03-staging-caller-two-connected.png` — caller at two connected.
- `04-staging-recipient-two-connected.png` — recipient at two connected.

The screenshots contain no API credential, room secret, meeting ID, or private
endpoint.
