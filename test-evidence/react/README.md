# React staging acceptance — 2026-08-20

Environment: local React app on port 4174, local shared backend on port 8790,
MediaSFU staging rooms API. Production was excluded. Credentials were loaded
from an external ignored file and did not enter the repository, browser bundle,
screenshots, console logs, or this manifest.

## Result

- real staging room created through the backend proxy: pass;
- second browser participant joined the same room: pass;
- both clients reported two participants: pass;
- host published an animated canvas through the SDK's real WebRTC video
  producer: pass;
- guest consumed and rendered that track as remote media: pass;
- deterministic local/remote labels visible: pass;
- onboarding-only screenshot is not counted as media proof;
- camera and microphone device production: not claimed in this browser run;
- the corrected identity → contact call → incoming accept flow created and
  joined a real staging room without displaying a meeting-ID control: pass;
- both refined clients reached `Live`: pass;
- caller published the animated canvas and recipient rendered it as remote
  video (`240x134`, `readyState=4`, playing): pass;
- ending from the recipient returned both users to call history with `Ended`:
  pass;
- the SDK leave path was invoked and the generated local JSON session file was
  removed; separate remote room deletion is not claimed;
- refined identity onboarding and contact-call home were visually inspected
  after the correction; these local UI images are not live-room evidence;
- physical camera and microphone production were not exercised and are not claimed.

## Images

- `01-onboarding.png` — visual-only onboarding check; not WebRTC evidence.
- `02-host-local-canvas-producer.png` — host, two participants, local produced video.
- `03-guest-remote-canvas-consumer.png` — guest, two participants, consumed remote video.
- `04-refined-identity-onboarding.png` — corrected onboarding UI; local visual evidence.
- `05-refined-chats-calls-home.png` — corrected contact + audio/video choice UI; local visual evidence.
- `06-staging-incoming-contact-call.png` — recipient sees the real incoming contact call before joining.
- `07-staging-caller-test-media.png` — caller is Live and publishes real canvas video.
- `08-staging-recipient-remote-media.png` — recipient is Live and renders the caller's remote video.

No screenshot or static fixture is counted as acceptance without the associated
live create/join/produce/consume observation above.
