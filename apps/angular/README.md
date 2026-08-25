# Angular familiar-call app

A runnable Angular 19 client for the repository's shared WhatsApp-style call
backend. The product flow is identity onboarding → contact selection → outgoing
call or incoming acceptance → custom MediaSFU call surface. Meeting IDs stay
inside the backend/SDK integration and are never requested from the user.

## Run locally

Start the single `server/` backend, then run:

```bash
cd apps/angular
npm install
npm run dev
```

Open <http://127.0.0.1:4174>. The dev proxy forwards `/api` to the backend on
`127.0.0.1:8790`; set `MEDIASFU_BACKEND_ORIGIN` to use another local backend
port. No MediaSFU API credential enters this app. Use separate
browser profiles and identities for an actual caller/recipient run.

This Angular SDK line has no Modern wrapper, so the app uses the verified
`MediasfuGeneric` headlessly through `MediasfuHeadlessService`. Cloud create and
join flows also bind the exported `PreJoinPage`; the generic component's default
welcome page is intended for already-issued event credentials. The app selects
screen share → remote camera → local camera, mounts every prepared audio
component, displays control failures, and leaves before ending the app session.

For a public release, install compatible published `mediasfu-angular` and
`mediasfu-shared` versions from the normal package registry and verify a clean
installation.

Validated: production build, real staging create/invite/accept, and two
participants connected. Remote video/audio remain unverified; see
`../../test-evidence/angular/manifest.md` for the measured boundary.

## Standards-only alternative

The `familiar-call-whip-whep` target is an Angular lifecycle host for the shared
browser WHIP/WHEP implementation and imports no MediaSFU client SDK. Run
`npm run dev:whip-whep`, then open `http://127.0.0.1:4182`. See the public
[framework-host guide](../whip-whep/FRAMEWORK_HOSTS.md) for architecture,
security, behavior, and validation.
