# React Native Android evidence

This directory separates emulator runtime proof from staging media acceptance.

- `09-onboarding-clean-api36.png` is the clean, visually inspected runtime
  screenshot from the `Medium_Phone_API_36` emulator after the app was bundled
  with matching local React Native and shared SDK sources.
- `08-onboarding-local-rn-shared-api36.png` shows the same successful render
  with React Native's development warning banner still visible.
- earlier numbered images are diagnostic captures from stale-shared, Metro, and
  startup investigations. They are not acceptance evidence.
- `manifest.json` is authoritative about what was and was not verified.

There is no claim of a real MediaSFU call here. Staging creation, a separate
participant, production, consumption, screen share, and teardown remain pending.
