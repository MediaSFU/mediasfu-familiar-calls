# Kotlin Android WHIP/WHEP staging evidence

Captured 2026-08-22 with the SDK-free Kotlin application on an Android API 36
emulator and a separate browser participant. MediaSFU credentials remained in
the ignored backend environment; this record contains no credential, bearer
token, room identifier, or credential-bearing URL.

## Measured acceptance

| Capability | Result | Retained evidence |
| --- | --- | --- |
| One backend-created staging room | Passed | Concurrent duplicate-create coverage resolved to one upstream room. |
| Two independent participants | Passed | Android and browser participants both reached `Live`. |
| Android camera publication | Passed | The browser decoded the native camera at `960 × 540`, `readyState = 4`, playing. |
| Android remote/local presentation | Passed with screenshot limitation | [`02-live-two-person-call.png`](./02-live-two-person-call.png) shows the remote-main/local-mini surface and live call state. Android `SurfaceViewRenderer` pixels are black in ordinary emulator screenshots; the browser decode measurement is the pixel-level media proof. |
| Screen-share consent and publication | Passed | [`04-screen-share-consent.png`](./04-screen-share-consent.png) and [`06-screen-share-live.png`](./06-screen-share-live.png) show the MediaProjection consent/lifecycle and the active screen-primary state. |
| Stop share and restore camera | Passed | [`07-live-camera-restored.png`](./07-live-camera-restored.png) shows the live camera state after screen capture stopped. |
| Room/session cleanup | Passed | The backend returned to zero active calls after End. |

## Claim boundary

This run does not claim human-audible remote playout, execution of the final
native drag/double-tap gesture listeners, physical-device behavior, iOS
behavior, or production infrastructure. Source and unit contracts cover the
bounded drag, double-tap swap, screen-share priority, independent audio path,
and cleanup wiring; they are not presented as substitutes for those unobserved
runtime checks.
