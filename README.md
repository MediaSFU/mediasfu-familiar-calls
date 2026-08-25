# MediaSFU familiar calls — multi-SDK

A complete set of familiar, chat-style audio and video calling examples built on
MediaSFU headless SDK interfaces, plus standards-only WHIP/WHEP implementations
for every represented framework with no MediaSFU client SDK. Every frontend follows the
same product flow:

1. create a local example identity;
2. open **Chats & calls**, enter a contact's user ID, and choose audio or video;
3. the shipped backend invisibly creates the MediaSFU room and rings the contact;
4. the recipient accepts or declines—never a meeting ID;
5. both users see the framework's custom call screen while MediaSFU handles media.

The identity fields keep this repository easy to run. They demonstrate the
flow, not production authentication. Replace them with authenticated users and
server-side authorization before launch.

## One backend, every frontend

[`server`](server) is the single framework-neutral call backend used by React,
Angular, Vue, Flutter, React Native, Expo, Kotlin/Android, and the SDK-free
browser and Unity WHIP/WHEP apps. It provides a secure room proxy, atomic JSON
session persistence, an HTTP polling contract, and optional Socket.IO call
events.

Only this backend reads `MEDIASFU_API_USERNAME` and `MEDIASFU_API_KEY`. SDK apps
receive room-scoped responses; the SDK-free app receives only short-lived
WHIP/WHEP leases for its current call. The public default is MediaSFU Cloud.

```powershell
cd server
npm install
Copy-Item .env.example .env
# Set your MediaSFU Cloud API username and key in server/.env.
npm test
npm start
```

Configure API access in the [MediaSFU developer console](https://mediasfu.com/documentation), try
authenticated calls in the [MediaSFU Sandbox](https://mediasfu.com/sandbox),
and read the [MediaSFU documentation](https://mediasfu.com/documentation).

MediaSFU Open means **your own already-running local MediaSFU server**. A client
URL or `localLink` does not install or start that server.

## Apps

| App | Media integration | Best starting point for |
| --- | --- | --- |
| `apps/react` | `mediasfu-reactjs` headless room plus a browser WHIP/WHEP alternate | Web applications and the reference interaction design |
| `apps/angular` | `mediasfu-angular` headless room plus the shared browser WHIP/WHEP alternate | Angular applications and service-based room composition |
| `apps/vue` | `mediasfu-vue` headless room plus the shared browser WHIP/WHEP alternate | Vue applications and composable custom call UI |
| `apps/react-native` | `mediasfu-reactnative` headless room plus an SDK-free native WHIP/WHEP entry | React Native CLI applications |
| `apps/expo` | `mediasfu-reactnative-expo` plus an SDK-free development-build alternate | Expo development builds; Expo Go does not include the required native WebRTC modules |
| `apps/flutter` | `mediasfu_sdk` plus a `flutter_webrtc` WHIP/WHEP entry | Flutter mobile and desktop application structure |
| `apps/kotlin-android` | `mediasfu-sdk-kotlin` headless Compose room | Native Android applications using the MediaSFU SDK |
| `apps/kotlin-android-whip-whep` | Android WebRTC with direct WHIP/WHEP transport | Native Android applications that do not use a MediaSFU client SDK |
| `apps/whip-whep` | Browser WebRTC with direct WHIP/WHEP transport | Standards-only browser integrations and protocol learning |
| `apps/unity-whip-whep` | Unity WebRTC with direct WHIP/WHEP transport | Unity scene integration; test Editor/player media before distributing a Unity build |

See [tested platform compatibility](VALIDATION_STATUS.md) to learn what each
app includes, which builds have passed, and which behaviors have been observed
in a live two-person room.

Every implementation must show screen share first, otherwise remote camera,
otherwise local camera; mirror only a normal local camera; mount every prepared
remote-audio renderer independently; accept every headless parameter/media
publication; and end both the MediaSFU room and backend session. When both
camera surfaces exist, double-tap/double-click the main or first mini surface to
swap focus. The mini preview (or screen-share preview strip) is draggable and
clamped inside the measured media stage. An active screen share remains primary
while both cameras move into the preview strip.

Run `node scripts/test-call-surface-parity.cjs` to check that all 16 app surfaces retain
the swap, bounded-drag, screen-priority, and all-audio rendering contracts.

See [`server/README.md`](server/README.md) for the shared API and
[`docs/VALIDATION.md`](docs/VALIDATION.md) for the two-person testing procedure.
Static fixtures and mock calls do not demonstrate a real WebRTC connection.

Before distributing an application based on this starter, install compatible
MediaSFU packages from their normal registries, resolve dependencies from a
clean checkout, and test the build, two-person media, and cleanup on every
target platform. Follow the [production-readiness checklist](docs/PROMOTION.md).

## License

Licensed under the [MIT License](LICENSE).
