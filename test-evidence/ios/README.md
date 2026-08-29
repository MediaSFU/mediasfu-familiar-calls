# Familiar Calls iOS validation

The screenshots below come from one automated call between two independent
SwiftUI clients running on iOS 26.2 simulators:

- [Caller receives recipient video](01-swift-host-receives-guest-video.png)
- [Recipient receives caller video](02-swift-guest-receives-host-video.png)

Each client joined through the app's normal call flow, published a deterministic
simulator camera track through the native Apple SDK media path, and waited for a
remote camera track before the screenshot was captured. The run passed in both
directions: caller to recipient and recipient to caller.

This validates room connection, camera publication, remote-track discovery,
video rendering, and the local preview inside the Familiar Calls Swift UI. It
does not replace physical-device checks for real camera capture, microphone
playout, or ReplayKit screen sharing.
