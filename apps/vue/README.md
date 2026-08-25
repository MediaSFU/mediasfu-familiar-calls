# Vue familiar-call app

A runnable Vue 3 client for the repository's shared call backend. Users choose
an identity and contact, start calls directly, receive an incoming-call card,
and accept or decline. They never see or enter a MediaSFU meeting ID.

## Run locally

Start `server/`, then:

```bash
cd apps/vue
npm install
npm run dev
```

Open <http://127.0.0.1:4174>. Vite forwards `/api` to `127.0.0.1:8790`; set
`MEDIASFU_BACKEND_ORIGIN` to use another local backend port. Use separate browser
profiles for caller and recipient.

`ModernMediasfuGeneric` remains mounted with `returnUI=false`, every publication
feeds `useMediasfuHeadless`, and rendering follows screen share → remote camera
→ local camera. Every audio renderer remains mounted independent of video.

For a public release, install compatible published `mediasfu-vue` and
`mediasfu-shared` versions from the normal package registry and verify a clean
installation.

Validated: app-only `vue-tsc --noEmit`, production Vite bundle, real staging
create/invite/accept, and backend session activation. SDK readiness and media
remain unverified; see `../../test-evidence/vue/manifest.md`.

## Standards-only alternative

This project also builds `/whip-whep.html`, a Vue lifecycle host for the shared
browser WHIP/WHEP implementation. That entry imports no MediaSFU client SDK.
Run `npm run dev:whip-whep`, then open
`http://127.0.0.1:4181/whip-whep.html`. See the public
[framework-host guide](../whip-whep/FRAMEWORK_HOSTS.md) for architecture,
security, behavior, and validation.
