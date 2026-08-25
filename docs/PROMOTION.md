# Production-readiness checklist

Use this checklist before distributing an application based on these starters
or describing a target platform as supported. Start with the versions declared
by the selected app's package manifest.

For each app:

1. replace development-only `file:`, path, tarball, override, or workspace references;
2. install compatible released SDK versions from their public package registries;
3. regenerate the package lock or `pubspec.lock`;
4. reinstall from a clean checkout and public registries;
5. run type checks, tests, lint, and production/debug builds as applicable;
6. run the complete two-person room procedure in `VALIDATION.md`;
7. review user-facing screens and scan source, logs, and screenshots for credentials or private room details;
8. describe supported platforms and known limitations in clear user-facing language.

For JavaScript wrappers, keep the framework SDK and its compatible
`mediasfu-shared` release aligned. A successful import alone does not prove that
the installed shared engine provides the headless selectors used by the app.
