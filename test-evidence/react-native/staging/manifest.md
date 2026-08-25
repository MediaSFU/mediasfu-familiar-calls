# React Native live-room evidence

This evidence set documents MediaSFU room and media behavior observed with the
React Native familiar-call app on an Android API 36 emulator. The media source
was the emulator's synthetic camera and microphone. No reusable credential,
room identifier, authorization header, or credential-bearing URL is retained.

## Verified outcomes

| Capability | Result | Evidence |
| --- | --- | --- |
| Backend room creation and incoming invitation | Verified | `01-real-staging-incoming-call.png` |
| Second participant joined the same room | Verified | Connected caller/recipient images and redacted session state |
| Audio capture and remote playout threads | Verified by Android WebRTC runtime measurements | Human-audible output was not recorded |
| Local video capture, production, and rendering | Verified | `04-post-fix-api36-real-room.png` |
| React Native video consumed by a React web peer | Verified at `readyState = 4`, 240×320 | `05-web-peer-receives-rn-video.jpg` and `05-web-peer-metrics.json` |
| Remote-main and local-mini presentation | Verified in both clients | `07-web-remote-main-local-mini.png` and `09-rn-remote-main-local-mini.png` |
| Bounded mini drag | Verified with emulator touch input | `10-rn-mini-dragged.png` and `12-interaction-metrics.json` |
| Double-tap/double-click media swap | Verified in both clients | `08-web-after-double-tap-swap.png` and `11-rn-after-double-tap-swap.png` |

The app and backend automated checks also passed before the retained live-room
run. Synthetic capture made the test repeatable; room creation, invitation,
WebRTC production, cross-SDK consumption, decoded video, and interactions were
real.

## Claim boundary

This set does not verify native-to-native remote video, physical camera quality,
human-audible output, screen-share capture, iOS behavior, or production
infrastructure. Those capabilities require separate target-runtime acceptance.

The screenshots may contain a React Native development banner. It identifies
the build mode and contains no credential or room information.
