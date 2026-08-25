<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AudioGrid, ModernMediasfuGeneric, useMediasfuHeadless } from 'mediasfu-vue';
import { createSession, endSession, joinSession, listSessions, type CallSession } from './src/sessionApi';

type Identity = { userId: string; displayName: string };
type CallConfig =
  | { mode: 'create'; targetUserId: string; callType: 'audio' | 'video' }
  | { mode: 'join'; session: CallSession; callType: 'audio' | 'video' };
type VideoSurface = { stream: MediaStream; local: boolean; screen: boolean; key: string; label: string };

const room = useMediasfuHeadless();
const identity = ref<Identity | null>(loadIdentity());
const userId = ref('');
const displayName = ref('');
const targetUserId = ref('');
const sessions = ref<CallSession[]>([]);
const call = ref<CallConfig | null>(null);
const activeSession = ref<CallSession | null>(null);
const notice = ref('');
const mediaStarted = ref(false);
const roleApplied = ref(false);
const testCanvas = ref<HTMLCanvasElement | null>(null);
const demoActive = ref(false);
const focusIndex = ref(0);
const miniOffset = ref({ x: 0, y: 0 });
const mediaStage = ref<HTMLElement | null>(null);
const previewStrip = ref<HTMLElement | null>(null);
let dragState: { pointerId: number; startX: number; startY: number; originX: number; originY: number } | null = null;
let demoTimer: number | undefined;
let demoStream: MediaStream | undefined;
let pollTimer: number | undefined;

const incoming = computed(() => sessions.value.find((item) =>
  item.status === 'ringing' && item.targetUserId === identity.value?.userId,
) ?? null);
const peerName = computed(() => call.value?.mode === 'create'
  ? call.value.targetUserId
  : call.value?.session.hostUserId ?? 'Contact');
const surfaces = computed<VideoSurface[]>(() => {
  const next: VideoSurface[] = [];
  const screen = room.screenShare.value;
  const remote = room.remoteVideos.value[0];
  const local = room.localVideo.value;
  if (screen.stream) next.push({ stream: screen.stream, local: screen.isLocal, screen: true, key: `screen-${screen.stream.id}`, label: screen.isLocal ? 'Your screen' : `${peerName.value}'s screen` });
  if (remote?.stream) next.push({ stream: remote.stream, local: false, screen: false, key: `remote-${remote.producerId || remote.stream.id}`, label: peerName.value });
  if (local) next.push({ stream: local, local: true, screen: false, key: `local-${local.id}`, label: 'You' });
  return next;
});
const screenActive = computed(() => surfaces.value[0]?.screen === true);
const normalizedFocus = computed(() => screenActive.value ? 0 : Math.min(focusIndex.value, Math.max(surfaces.value.length - 1, 0)));
const primary = computed(() => surfaces.value[normalizedFocus.value] ?? null);
const previews = computed(() => surfaces.value.filter((_, index) => index !== normalizedFocus.value));
const canSwapFocus = computed(() => !screenActive.value && surfaces.value.length > 1);
const preJoinOptions = computed<any>(() => {
  if (!identity.value || !call.value) return undefined;
  return call.value.mode === 'join'
    ? { action: 'join', meetingID: call.value.session.meetingId, userName: identity.value.displayName }
    : { action: 'create', duration: 30, capacity: 2, eventType: 'conference', userName: identity.value.displayName };
});

function loadIdentity(): Identity | null {
  try {
    const value = JSON.parse(localStorage.getItem('mediasfu-familiar-identity') || 'null');
    return value?.userId && value?.displayName ? value : null;
  } catch { return null; }
}

function saveIdentity() {
  const safeId = userId.value.trim();
  const safeName = displayName.value.trim();
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(safeId) || !/^[A-Za-z0-9]{2,10}$/.test(safeName)) {
    notice.value = 'Use a 2–64 character ID and a 2–10 character alphanumeric display name.';
    return;
  }
  identity.value = { userId: safeId, displayName: safeName };
  localStorage.setItem('mediasfu-familiar-identity', JSON.stringify(identity.value));
  void refreshSessions();
}

async function refreshSessions() {
  if (!identity.value) return;
  try {
    sessions.value = (await listSessions(identity.value.userId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Call service unavailable.';
  }
}

function begin(callType: 'audio' | 'video') {
  if (!identity.value || !/^[A-Za-z0-9_-]{2,64}$/.test(targetUserId.value.trim())) {
    notice.value = 'Choose a valid contact ID.';
    return;
  }
  notice.value = '';
  activeSession.value = null;
  room.updateSourceParameters({});
  mediaStarted.value = false;
  roleApplied.value = false;
  call.value = { mode: 'create', targetUserId: targetUserId.value.trim(), callType };
}

function accept(session: CallSession) {
  notice.value = '';
  activeSession.value = session;
  room.updateSourceParameters({});
  mediaStarted.value = false;
  roleApplied.value = false;
  call.value = { mode: 'join', session, callType: 'video' };
}

async function decline(session: CallSession) {
  if (!identity.value) return;
  try { await endSession(session.id, identity.value.userId, 'declined'); }
  catch (error) { notice.value = error instanceof Error ? error.message : 'Could not decline call.'; }
  await refreshSessions();
}

async function createMediaSFURoom(): Promise<any> {
  if (!identity.value || call.value?.mode !== 'create') return { success: false, data: { error: 'Call setup expired.' } };
  try {
    const response = await createSession({ hostUserId: identity.value.userId, targetUserId: call.value.targetUserId, displayName: identity.value.displayName });
    activeSession.value = response.session;
    await refreshSessions();
    return { success: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start call.';
    notice.value = message;
    return { success: false, data: { error: message } };
  }
}

async function joinMediaSFURoom(): Promise<any> {
  if (!identity.value || call.value?.mode !== 'join') return { success: false, data: { error: 'Call invitation expired.' } };
  try {
    const response = await joinSession({ sessionId: call.value.session.id, userId: identity.value.userId, displayName: identity.value.displayName });
    activeSession.value = response.session;
    await refreshSessions();
    return { success: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not accept call.';
    notice.value = message;
    return { success: false, data: { error: message } };
  }
}

function updateSourceParameters(parameters: any) {
  room.updateSourceParameters(parameters || {});
  if (!call.value) return;
  if (!roleApplied.value && typeof parameters?.updateIslevel === 'function') {
    parameters.updateIslevel(call.value.mode === 'create' ? '2' : '1');
    roleApplied.value = true;
  }
}

function clampMiniOffset(offset: { x: number; y: number }) {
  const stage = mediaStage.value?.getBoundingClientRect();
  const mini = previewStrip.value?.getBoundingClientRect();
  if (!stage || !mini) return { x: 0, y: 0 };
  const gap = 14;
  const baseLeft = Math.max(stage.width - mini.width - gap, 0);
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
  return { x: clamp(offset.x, -baseLeft, gap), y: clamp(offset.y, -gap, Math.max(stage.height - mini.height - gap, -gap)) };
}

function measurePreview() { miniOffset.value = clampMiniOffset(miniOffset.value); }
function swapFocus() {
  if (!canSwapFocus.value) return;
  focusIndex.value = focusIndex.value === 0 ? 1 : 0;
}
function beginMiniDrag(event: PointerEvent) {
  dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: miniOffset.value.x, originY: miniOffset.value.y };
  (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}
function moveMini(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  miniOffset.value = clampMiniOffset({ x: dragState.originX + event.clientX - dragState.startX, y: dragState.originY + event.clientY - dragState.startY });
}
function endMiniDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  (event.currentTarget as HTMLElement)?.releasePointerCapture?.(event.pointerId);
  dragState = null;
}

watch([screenActive, () => surfaces.value.length], ([sharing, count]) => {
  if (sharing || focusIndex.value >= Number(count)) focusIndex.value = 0;
  void nextTick(measurePreview);
});

watch(() => room.ready.value, async (ready) => {
  if (!ready || !call.value || mediaStarted.value) return;
  mediaStarted.value = true;
  const actions = [room.controls.toggleMic()];
  if (call.value.callType === 'video') actions.push(room.controls.toggleCamera());
  const results = await Promise.all(actions);
  const failed = results.find((item) => !item.ok);
  if (failed) notice.value = failed.error;
});

async function run(action: () => Promise<{ ok: boolean; error: string }>) {
  const result = await action();
  if (!result.ok) notice.value = result.error;
}

async function toggleDemoVideo() {
  if (demoActive.value) {
    if (demoTimer) window.clearInterval(demoTimer);
    demoTimer = undefined;
    demoStream?.getTracks().forEach((track) => track.stop());
    demoStream = undefined;
    const result = await room.produce.stop('video');
    demoActive.value = false;
    if (!result.ok) notice.value = result.error;
    return;
  }
  const canvas = testCanvas.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) { notice.value = 'The media test canvas is unavailable.'; return; }
  let frame = 0;
  const draw = () => {
    frame += 1;
    const hue = (frame * 2) % 360;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `hsl(${hue} 50% 13%)`);
    gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 74% 38%)`);
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#effff7'; context.font = '800 72px Inter, sans-serif';
    context.fillText('MediaSFU live media', 76, 250);
    context.font = '500 34px Inter, sans-serif';
    context.fillText(`${identity.value?.displayName || 'Caller'} · Vue WebRTC producer`, 80, 320);
    context.beginPath(); context.arc(130 + ((frame * 9) % 980), 520, 54, 0, Math.PI * 2);
    context.fillStyle = '#5bf0a4'; context.fill();
  };
  draw(); demoTimer = window.setInterval(draw, 100);
  const result = await room.produce.canvas(canvas, 15);
  if (!result.ok) {
    if (demoTimer) window.clearInterval(demoTimer);
    demoTimer = undefined; notice.value = result.error; return;
  }
  demoStream = result.stream ?? undefined;
  demoActive.value = true;
  notice.value = '';
}

async function finish() {
  try {
    if (demoActive.value) await toggleDemoVideo();
    if (room.ready.value) await room.controls.leave();
    if (activeSession.value && identity.value) await endSession(activeSession.value.id, identity.value.userId);
  } catch (error) { notice.value = error instanceof Error ? error.message : 'Call cleanup failed.'; }
  call.value = null;
  activeSession.value = null;
  room.updateSourceParameters({});
  await refreshSessions();
}

onMounted(() => {
  void refreshSessions();
  pollTimer = window.setInterval(refreshSessions, 1800);
  window.addEventListener('resize', measurePreview);
});
onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (demoTimer) window.clearInterval(demoTimer);
  demoStream?.getTracks().forEach((track) => track.stop());
  if (room.ready.value) void room.controls.leave();
  window.removeEventListener('resize', measurePreview);
});
</script>

<template>
  <main v-if="!identity" class="onboarding">
    <section class="glass lobby">
      <span class="brand">MediaSFU Familiar</span><h1>Your calls, without meeting codes.</h1>
      <p>Choose an identity for this local demonstration. A production app replaces this with authenticated accounts.</p>
      <label>Your user ID<input v-model="userId" autocomplete="username" placeholder="alex" /></label>
      <label>Display name<input v-model="displayName" maxlength="10" placeholder="Alex" /></label>
      <button class="primary" @click="saveIdentity">Continue</button><p v-if="notice" class="error">{{ notice }}</p>
    </section>
  </main>
  <main v-else-if="!call" class="home">
    <header><div><span class="brand">MediaSFU Familiar</span><h1>Calls</h1></div><div class="avatar">{{ identity.displayName.slice(0, 2).toUpperCase() }}</div></header>
    <section v-if="incoming" class="incoming glass">
      <span class="eyebrow">Incoming call</span><h2>{{ incoming.displayName || incoming.hostUserId }}</h2><p>{{ incoming.hostUserId }} is calling securely.</p>
      <div class="actions"><button @click="decline(incoming)">Decline</button><button class="primary" @click="accept(incoming)">Accept</button></div>
    </section>
    <section class="glass dialer"><label>Call a contact<input v-model="targetUserId" placeholder="Contact user ID" /></label><div class="actions"><button @click="begin('audio')">Audio call</button><button class="primary" @click="begin('video')">Video call</button></div></section>
    <section class="history"><div class="section-title"><h2>Recent calls</h2><span>{{ sessions.length }}</span></div>
      <article v-for="session in sessions" :key="session.id" class="session-row">
        <div class="avatar small">{{ (session.hostUserId === identity.userId ? session.targetUserId : session.hostUserId).slice(0, 2).toUpperCase() }}</div>
        <div><strong>{{ session.hostUserId === identity.userId ? session.targetUserId : session.hostUserId }}</strong><small>{{ session.status }} · {{ new Date(session.updatedAt).toLocaleString() }}</small></div>
      </article><p v-if="!sessions.length" class="muted">No calls yet. Choose a contact to begin.</p>
    </section><p v-if="notice" class="error toast">{{ notice }}</p>
  </main>
  <main v-else class="call-shell">
    <ModernMediasfuGeneric :key="activeSession?.id || `${call.mode}-${peerName}`" :return-u-i="false"
      :source-parameters="room.sourceParameters" :update-source-parameters="updateSourceParameters"
      :no-u-i-pre-join-options="preJoinOptions" :create-media-s-f-u-room="createMediaSFURoom"
      :join-media-s-f-u-room="joinMediaSFURoom" @media-changed="room.onMediaChanged" />
    <header><div class="avatar">{{ peerName.slice(0, 2).toUpperCase() }}</div><div><strong>{{ peerName }}</strong><small>{{ room.ready.value ? `${room.participants.value.length} connected` : room.readiness.value.reason }}</small></div></header>
    <section ref="mediaStage" class="media-stage" :class="{ screen: primary?.screen }" :data-focus-index="normalizedFocus">
      <button v-if="primary" type="button" class="main-media" @dblclick.prevent="swapFocus" aria-label="Main call media. Double-click or double-tap to swap with the mini preview."><video :srcObject="primary.stream" :muted="primary.local" autoplay playsinline :class="{ local: primary.local, screen: primary.screen }" /></button>
      <section v-else class="empty"><div class="avatar hero">{{ peerName.slice(0, 2).toUpperCase() }}</div><strong>{{ room.ready.value ? 'Audio call' : 'Connecting securely…' }}</strong></section>
      <div v-if="previews.length" ref="previewStrip" class="media-previews" :style="{ transform: `translate3d(${miniOffset.x}px, ${miniOffset.y}px, 0)` }" @pointerdown="beginMiniDrag" @pointermove="moveMini" @pointerup="endMiniDrag" @pointercancel="endMiniDrag">
        <button v-for="(surface, index) in previews" :key="surface.key" type="button" class="mini-media" @dblclick.prevent="index === 0 && swapFocus()" @click="!screenActive && (focusIndex = surfaces.indexOf(surface))" :aria-label="index === 0 ? 'Mini call media. Double-click or double-tap to swap with the main media.' : `Focus call preview ${index + 1}`"><video :srcObject="surface.stream" :muted="surface.local" autoplay playsinline :class="{ local: surface.local }" /><span>{{ surface.label }}</span></button>
        <i class="preview-grip" aria-hidden="true">⋮⋮</i>
      </div>
    </section>
    <p v-if="previews.length" class="gesture-hint">Double-tap to swap views · Drag the small view to move it</p>
    <p v-if="notice" class="error">{{ notice }}</p>
    <nav><button :disabled="!room.ready.value" @click="run(room.controls.toggleMic)">Mic</button><button :disabled="!room.ready.value" @click="run(room.controls.toggleCamera)">Camera</button><button :disabled="!room.ready.value" @click="run(room.controls.toggleScreenShare)">Share</button><button :disabled="!room.ready.value" @click="toggleDemoVideo">{{ demoActive ? 'Stop test' : 'Test media' }}</button><button class="end" @click="finish">End</button></nav>
    <p class="test-note">“Test media” publishes an animated canvas through the real room for repeatable two-browser verification.</p>
    <div class="remote-audio" aria-hidden="true"><AudioGrid :components-to-render="room.audioComponents.value" /></div>
    <canvas ref="testCanvas" width="1280" height="720" aria-hidden="true" class="test-canvas" />
  </main>
</template>

<style>
*{box-sizing:border-box}body{margin:0;background:#eef4f0;color:#18372b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}button,input{font:inherit}button{cursor:pointer;border:0;border-radius:999px;padding:.85rem 1.2rem;background:#e3ece7;color:#15382a;font-weight:800}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#25d366;color:#052d1d}.brand,.eyebrow{color:#168c4a;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;font-weight:900}.onboarding,.home{min-height:100vh;padding:clamp(1.25rem,4vw,3.5rem);background:radial-gradient(circle at 80% 0,#d9f8e5,transparent 35%),#f4f8f5}.glass{background:#ffffffd9;border:1px solid #fff;border-radius:28px;box-shadow:0 24px 70px #335c4819}.lobby{max-width:560px;margin:8vh auto;padding:clamp(1.6rem,5vw,3rem)}h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1;margin:.5rem 0 1rem}label{display:grid;gap:.45rem;margin:1rem 0;font-weight:800}input{border:1px solid #cadad1;border-radius:15px;padding:1rem;background:#f9fcfa;color:#18372b}.home{max-width:900px;margin:auto}.home>header{display:flex;justify-content:space-between;align-items:center}.avatar{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#25d366;color:#063420;font-weight:900}.small{width:42px;height:42px}.incoming,.dialer{padding:1.4rem;margin:1.5rem 0}.incoming{background:linear-gradient(135deg,#0b372c,#165945);color:white}.actions{display:flex;gap:.75rem;flex-wrap:wrap}.section-title,.session-row{display:flex;align-items:center;gap:1rem}.section-title{justify-content:space-between}.session-row{padding:1rem 0;border-bottom:1px solid #dce8e1}.session-row>div:nth-child(2){display:grid;gap:.25rem}.session-row small,.muted{color:#6f877b}.error{color:#ffb4b4}.toast{color:#a52336}.call-shell{min-height:100vh;background:radial-gradient(circle at top,#174a43,#071713 65%);color:#f4fbf8;display:grid;grid-template-rows:auto 1fr auto auto;gap:1rem;padding:1.25rem}.call-shell>header{display:flex;align-items:center;gap:.8rem}.call-shell small{display:block;color:#a9c7be}.call-shell video,.empty{width:100%;height:100%;min-height:340px;border-radius:28px;background:#0d2924;object-fit:cover;box-shadow:0 28px 80px #0008}.call-shell video.screen{object-fit:contain}.call-shell video.local{transform:scaleX(-1)}.empty{display:grid;place-items:center;align-content:center;gap:1rem}.hero{width:96px;height:96px;font-size:1.6rem}.call-shell nav{display:flex;justify-content:center;gap:.8rem;flex-wrap:wrap}.call-shell nav button{background:#183b35;color:white}.call-shell nav .end{background:#e94f5f}.test-note{margin:0;text-align:center;color:#789889;font-size:.72rem}.test-canvas,.remote-audio{position:absolute;width:1px;height:1px;overflow:hidden;opacity:.01;pointer-events:none}.test-canvas{right:0;bottom:0}.remote-audio{left:0;bottom:0}@media(max-width:600px){.call-shell{padding:.8rem}.call-shell video,.empty{min-height:55vh}.test-note{display:none}}
.media-stage{position:relative;min-height:340px;overflow:hidden;border-radius:28px;background:#0d2924}.main-media{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;border-radius:0;background:transparent}.main-media video{min-height:0;border-radius:0}.media-previews{position:absolute;z-index:4;top:14px;right:14px;display:flex;gap:8px;max-width:min(52%,420px);touch-action:none;cursor:grab;will-change:transform}.media-previews:active{cursor:grabbing}.mini-media{position:relative;width:clamp(112px,18vw,190px);aspect-ratio:16/10;padding:0;overflow:hidden;border:2px solid #8cd8aa;border-radius:16px;background:#10251c;box-shadow:0 10px 28px #0009;color:#fff}.mini-media video{min-height:0;border-radius:0;box-shadow:none}.mini-media span{position:absolute;left:8px;bottom:7px;padding:4px 7px;border-radius:999px;background:#03100cbf;font-size:10px}.preview-grip{position:absolute;right:-2px;bottom:-2px;display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#8cd8aa;color:#092519;font-style:normal;pointer-events:none}.gesture-hint{margin:-.7rem 0 0;text-align:center;color:#8ba99b;font-size:.72rem;font-weight:700}
</style>
