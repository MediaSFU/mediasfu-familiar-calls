# Familiar-call media presentation contract

Room creation, joining, signaling, and teardown belong to the shared backend
and each MediaSFU SDK. The product-specific presentation decision stays in a
small framework adapter so a UI port does not need to rewrite call plumbing.

Every app applies the same rules:

1. Ignore streams without usable media.
2. Show an active screen share as the primary surface.
3. Otherwise show the first remote camera as primary.
4. Fall back to the local camera when no remote camera is ready.
5. Put the remaining remote cameras and local camera in the preview strip.
6. Mirror only a normal local camera, never remote video or screen share.
7. Keep every prepared remote-audio output active independently of video focus.
8. Disable focus swapping while screen share is primary.
9. Clamp the draggable preview inside the measured media stage.

[`mediaPresentation.ts`](mediaPresentation.ts) is the typed reference for the
JavaScript-family apps. Android mirrors it in
`apps/kotlin-android/.../MediaPresentation.kt`; Flutter keeps its equivalent in
`apps/flutter/lib/main.dart`; the SDK-free React Native/Expo adapter uses
`packages/whip-whep-react-native/src/presentation.js`; the SDK-free Flutter and
Android variants use `apps/flutter/lib/whip_whep/presentation.dart` and
`apps/kotlin-android-whip-whep/.../MediaPresentation.kt`; Unity keeps its equivalent in
`apps/unity-whip-whep/Assets/Scripts/Presentation/MediaPresentation.cs`.
`scripts/test-call-surface-parity.cjs` guards the required interaction hooks
across all surfaces.

This package is a behavioral contract, not a runtime dependency. Keeping the
projection framework-local avoids forcing TypeScript into native builds while
making the priority policy independently testable.
