# Acceptance contract

An app is verified only after all of the following are retained in a redacted
manifest and visually inspectable screenshots under `test-evidence/<app>/`:

- a disposable room created through the repository's backend proxy in an
  authorized non-production environment;
- host and a genuinely separate second participant joined;
- ordinary WebRTC audio/video produced and consumed;
- visible proof of screen-share > remote-camera > local-camera fallback;
- every remote audio renderer remained mounted while video changed;
- leave/end completed and the temporary room was cleaned up;
- no credential, authorization header, room secret, or credential-bearing URL
  appears in source, logs, screenshots, or evidence.

For mobile apps, record the emulator, simulator, or device class used. Do not
generalize one target's result to another operating system or hardware class.

## Evidence manifest shape

```json
{
  "environment": "staging",
  "sdk": "react-native",
  "participants": 2,
  "produced": ["audio", "video"],
  "consumed": ["audio", "video"],
  "screenShareObserved": true,
  "teardown": "passed",
  "credentialsRetained": false,
  "screenshots": ["host.png", "participant.png"]
}
```

Room identifiers should be hashed or shortened in retained proof. Contract SVGs
and unit tests are useful supplemental evidence but never replace this run.

For `apps/whip-whep`, the real-room manifest must additionally name two active
WHIP external-session resources, two WHEP playback resources, decoded audio and
video in both directions, WHEP payload-profile alignment, playback-before-source
cleanup, and room deletion. Synthetic interaction previews must say `not live`
inside the image and cannot fill any real-room matrix cell.
