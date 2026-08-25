# React Native evidence

This folder contains public-safe React Native visual and runtime evidence. It
contains no credentials or retained room identifier.

- `media-resolution-contract.svg` and `.png` are deterministic visual evidence for the tested presentation contract. They are not live-room screenshots.
- App tests: 15/15 passed.
- Focused ESLint: passed.
- Android release-mode Metro bundle: passed.
- Backend tests: 6/6 passed.
- `npx react-native config`: passed.
- The API 36 Android build installed and rendered successfully on an emulator.
- Real room creation, invitation, join, audio capture/playout, video production,
  cross-SDK remote video, main/mini presentation, drag, and double-tap swap are
  documented in [`staging/manifest.md`](staging/manifest.md).

Native-to-native remote video, human-audible output, and received screen sharing
remain unverified. Use compatible published SDK versions and repeat the complete
acceptance matrix before publishing a fork.
