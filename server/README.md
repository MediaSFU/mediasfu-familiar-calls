# Shared familiar-call backend

This is the one backend for every frontend in the multi-SDK example. It owns
MediaSFU credentials, room creation/joining, call session persistence, incoming
call signaling, and lifecycle state. Users call contacts; they never copy a
meeting ID or receive the account API key.

The implementation reuses the API and lifecycle model proven by the standalone
WhatsApp-style React Native handoff. Sessions are written atomically to
`server/data/sessions.json`. This is convenient example persistence, not a
production identity database.

## Run locally

```powershell
cd server
npm install
Copy-Item .env.example .env
# Add MEDIASFU_API_USERNAME and MEDIASFU_API_KEY to this private file.
npm test
npm start
```

The default backend port is `8790`; no example uses port `3001`. The room API
defaults to `https://mediasfu.com/v1/rooms/`. For authorized staging tests, put
configuration in a file outside the repository and set
`MEDIASFU_VALIDATION_ENV_PATH` to its absolute path. Never copy that file into
evidence or source control.

`MEDIASFU_EXTERNAL_MEDIA_API_URL` selects the matching origin for external
sessions and WHEP playback resources. It must describe the same environment as
`MEDIASFU_ROOM_API_URL`; never create a staging room and provision its external
media through the production origin.

## HTTP contract

All errors use `{ "success": false, "error": "safe message" }`.

- `GET /health` returns service readiness and whether server credentials exist.
- `GET /api/users/:userId/sessions` returns `{ success, data: Session[] }` for
  the caller or recipient. Frontends may poll this route for incoming calls.
- `GET /api/sessions/:sessionId` returns one sanitized session.
- `POST /api/rooms/create` accepts
  `{ hostUserId, targetUserId, displayName, callType, duration, capacity, eventType }`.
  It stores a `ringing` session and returns `{ success, data, session }` (201).
- `POST /api/rooms/join` accepts `{ sessionId, userId, displayName }`. It
  authorizes the participant, looks up the meeting ID, joins it invisibly,
  marks the session `active`, and returns `{ success, data, session }`.
- `POST /api/sessions/:sessionId/end` accepts `{ userId, reason }`, marks the
  session `ended`, and returns `{ success, data: session }`.

The SDK-free `apps/whip-whep` frontend additionally uses:

- `POST /api/protocol/calls/create` to create the invisible two-person room and
  ringing session without returning account or room credentials;
- `POST /api/protocol/calls/accept` to accept the contact call without creating
  an unused SDK participant;
- `POST /api/protocol/prepare` to create the participant's WHIP publisher;
- `GET /api/protocol/sessions/:sessionId/peer?userId=...` to wait for active
  peer tracks, provision that participant's WHEP playback, and read the peer's
  optional presentation state;
- `POST /api/protocol/sessions/:sessionId/presentation` with
  `{ userId, screenActive }` to publish ephemeral screen-share state after the
  participant has prepared its WHIP publisher.

The caller's owner-authorized external session is admitted as the single WHIP
host; the recipient remains an external participant. This role is an internal
backend decision. Browsers cannot choose or elevate their own room role.

Protocol bearer tokens and presentation state live only in backend memory and
the authorized demo browser's current call. End cleanup removes WHEP playbacks before WHIP source
sessions, then requests room deletion. A process restart intentionally drops
the in-memory leases; production should use an encrypted, expiring lease store.

`displayName` is 2–10 alphanumeric characters. User IDs are 2–64 letters,
numbers, underscores, or hyphens. These client-supplied IDs are demo identity,
not authentication.

## Retry-safe room requests

`POST /api/rooms/create` and `POST /api/rooms/join` accept an
`Idempotency-Key` header. Generate one opaque 8–128 character key when the user
starts a logical action, preserve it until that action succeeds or is abandoned,
and reuse it for an exact network retry. Never reuse the key for a later call or
for a different participant.

```js
const idempotencyKey = crypto.randomUUID();
await fetch('/api/rooms/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ hostUserId, targetUserId, displayName, callType: 'video' }),
});
```

The proxy validates and forwards the header to MediaSFU without persisting or
logging it. The SDK-free protocol create route already has a stable `requestId`;
the backend also uses that value as its upstream room idempotency key. Missing
headers remain accepted for older clients.

## Socket.IO contract

HTTP polling works in every framework. Clients that want immediate updates may
also connect with Socket.IO:

- emit `presence:register` with `{ userId }`;
- optionally emit `session:sync` with `{ userId }` and read its acknowledgement;
- listen for `call:invite`, `call:joined`, and `call:ended`.

Configure `CORS_ORIGIN` for the deployed frontend. Production also requires real
authentication/authorization, managed storage, HTTPS, rate limiting, abuse
controls, observability, and retention rules. A supplied user ID is not proof
that the caller owns that identity.

The server never persists upstream MediaSFU responses, room secrets,
credentials, or authorization headers, and does not log request bodies.
