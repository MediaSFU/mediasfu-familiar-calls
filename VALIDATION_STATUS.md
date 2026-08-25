# Tested platform compatibility

All application surfaces implement the applicable media-priority rule,
main/mini activation, a bounded draggable preview or preview strip, and
independent rendering of every prepared remote-audio component. The table keeps
successful source/build checks separate from behavior observed in a live room.

| App | Static/build validation | Real staging room |
| --- | --- | --- |
| React Native | Jest, lint, SDK contract checks, backend tests, Metro bundle, and Android debug APK assembly pass | Native camera publication, React-Web remote consumption, remote-main/local-mini presentation, emulator drag, double-tap swap, and audio capture/playout were observed. Native-to-native remote-video and audible-output checks are not yet evidenced |
| React | Backend lifecycle tests and the production build pass | Two users completed contact calling, accept, reciprocal test-media rendering, main/mini activation, and teardown |
| Angular | Production build passes | Two users completed create, invite, accept, connected state, and teardown. Video/audio rendering acceptance is not yet evidenced |
| Vue | Type check and production build pass | Backend create, invite, accept, active, and ended states were observed. SDK-ready media acceptance is not yet evidenced |
| Expo | Type check and production Web export pass | Two Web identities completed create, invite, accept, SDK connection, and teardown. Native development-build media acceptance is not yet evidenced |
| Flutter | Focused tests, analysis, and Android debug APK build/install/launch pass | Two-person live-room media acceptance is not yet evidenced |
| Kotlin / Android SDK | Compose compilation, presentation tests, Android lint, debug APK build, install, and launch pass | Two-person SDK media acceptance is not yet evidenced |
| Browser framework WHIP/WHEP hosts | Shared protocol tests and React, Angular, and Vue production builds pass without MediaSFU SDK imports | The shared browser core has live-room proof; per-framework interaction evidence is not yet available |
| React Native and Expo WHIP/WHEP | Shared protocol/presentation tests and the Android Metro production bundle pass | Native publication, playback, audible-audio, gesture, and screen-share acceptance are not yet evidenced |
| Flutter WHIP/WHEP | Protocol/presentation tests and focused analysis pass | Native publication, playback, audible-audio, gesture, and screen-share acceptance are not yet evidenced |
| Kotlin / Android WHIP/WHEP | Unit tests, Android lint, debug APK assembly, install, launch, and duplicate-create protection pass | A native/browser call decoded Android camera video at 960×540, rendered main/mini surfaces, published and stopped screen share, restored camera, and cleaned up. Audible playout and post-fix gesture acceptance are not yet evidenced |
| Browser WHIP/WHEP core | Protocol, presentation, backend lifecycle, production build, swap, and pointer-drag checks pass | Two browsers reciprocally published and decoded 1280×720 video, exercised main/mini interactions, ended the call, and cleaned up |
| Unity WHIP/WHEP | SDK-free backend, protocol, media, and presentation source checks pass | Unity Editor/player, live media, audible playout, and interaction acceptance are required before release |

For the strongest adoption signal, look for redacted evidence of a separate
second participant, bidirectional production and consumption, screen share
where supported, teardown, and credential cleanup as defined in
`docs/VALIDATION.md`.

Public-safe React Native evidence is indexed at
`test-evidence/react-native/staging/manifest.md`. Applications should use
published SDK versions and repeat the target-platform acceptance matrix in
their own deployment environment.
