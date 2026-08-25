import { clampMiniOffset, consumeWhep, publishWhip, resolveScreenPresentation } from './protocol.js';

let root = null;
let pollInterval = null;
const IDENTITY_KEY = 'mediasfu-whip-whep-identity';
const POLL_MS = 1_500;
const query = new URLSearchParams(location.search);
const stagingValidation = import.meta.env.DEV && query.get('validation') === 'staging';

const state = {
  identity: readIdentity(),
  sessions: [],
  incoming: null,
  active: null,
  localStream: null,
  remoteStream: null,
  screenStream: null,
  remoteScreenActive: false,
  publisher: null,
  playback: null,
  remotePrimary: true,
  miniOffset: { x: 0, y: 0 },
  notice: '',
  phase: 'idle',
  preview: false,
  liveValidation: stagingValidation,
  syntheticAudio: null,
  peerTimer: null,
  ending: false,
};

function readIdentity() {
  try { return JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || 'null'); } catch { return null; }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

const initials = (value) => String(value || '??').slice(0, 2).toUpperCase();
const peerName = (session) => session.hostUserId === state.identity.userId
  ? session.targetUserId
  : session.hostUserId;

function renderOnboarding() {
  if (!root) return;
  root.innerHTML = `<main class="onboarding-shell">
    <section class="onboarding-card">
      <div class="brand-mark">M</div>
      <p class="eyebrow">MediaSFU · WHIP + WHEP</p>
      <h1>Calls that feel instantly familiar.</h1>
      <p class="supporting">Choose a local demo identity. You call a person—not a meeting ID—and the backend creates the room invisibly.</p>
      <form id="identity-form">
        <label>Display name<input id="display-name" autofocus autocomplete="name" placeholder="Alex" /></label>
        <label>Your user ID<input id="user-id" autocomplete="username" placeholder="alex-01" /></label>
        <p id="form-error" class="notice hidden" role="alert"></p>
        <button class="primary" type="submit">Continue to calls <span>→</span></button>
      </form>
      <small>No MediaSFU client SDK is loaded. The browser uses standards-based WHIP publishing and WHEP playback; account credentials stay on the backend.</small>
    </section>
  </main>`;
  root.querySelector('#identity-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const identity = {
      displayName: root.querySelector('#display-name').value.trim(),
      userId: root.querySelector('#user-id').value.trim(),
    };
    const error = !/^[A-Za-z0-9]{2,10}$/.test(identity.displayName)
      ? 'Use 2–10 letters or numbers for your display name.'
      : !/^[A-Za-z0-9_-]{2,64}$/.test(identity.userId)
        ? 'Use 2–64 letters, numbers, underscores, or hyphens for your user ID.'
        : '';
    if (error) {
      const element = root.querySelector('#form-error');
      element.textContent = error;
      element.classList.remove('hidden');
      return;
    }
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    state.identity = identity;
    state.notice = '';
    renderHome();
    void pollSessions();
  });
}

function renderHome() {
  if (!root) return;
  const sessions = state.sessions.map((session) => `<button class="session-row" data-session="${session.id}" ${session.status === 'ended' ? 'disabled' : ''}>
    <span class="avatar">${initials(peerName(session))}</span>
    <span class="session-copy"><strong>${peerName(session)}</strong><small>${session.callType === 'audio' ? 'Audio' : 'Video'} · ${session.status === 'ended' ? 'Ended' : session.status === 'active' ? 'Connected' : 'Ringing'}</small></span>
    <time>${new Date(session.updatedAt || session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
  </button>`).join('');
  const incoming = state.incoming ? `<article class="incoming-card">
    <div class="incoming-person"><span class="avatar large">${initials(state.incoming.displayName)}</span><div><p class="eyebrow">Incoming ${state.incoming.callType} call</p><h2>${state.incoming.displayName}</h2><span>@${state.incoming.hostUserId} is calling</span></div></div>
    <div class="incoming-actions"><button id="decline" class="decline">Decline</button><button id="accept" class="accept">Accept call</button></div>
  </article>` : '';
  root.innerHTML = `<main class="home-shell"><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <section class="home-content">
      <header class="home-header"><div><p class="eyebrow">Protocol-native media calls</p><h1>Chats & calls</h1></div>
        <button id="change-identity" class="identity-chip" title="Change identity"><span class="avatar">${initials(state.identity.displayName)}</span><span><strong>${state.identity.displayName}</strong><small>@${state.identity.userId}</small></span></button>
      </header>
      <div class="connection-pill"><i></i>Ready for calls · WHIP/WHEP</div>
      ${incoming}
      <div class="home-grid">
        <section class="composer-card"><div class="card-heading"><div><h2>Start a call</h2><p>Invite someone by their user ID</p></div><span class="phone-mark">☎</span></div>
          <form id="call-form"><label>Who would you like to call?<input id="target-user" placeholder="friend-user-id" /></label>
            <div class="call-type" role="group" aria-label="Call type"><button type="button" data-type="video" class="selected">▰ Video</button><button type="button" data-type="audio">● Audio</button></div>
            <p class="notice ${state.notice ? '' : 'hidden'}" role="alert">${state.notice}</p>
            <button class="primary" type="submit">Call now <span>→</span></button>
          </form>
        </section>
        <section class="recent-card"><div class="card-heading"><div><h2>Recent calls</h2><p>People and call state—never room IDs</p></div><span class="count">${state.sessions.length}</span></div>
          <div class="session-list">${sessions || '<div class="empty-history"><span>☏</span><strong>Your recent calls appear here</strong><p>Call a contact to get started.</p></div>'}</div>
        </section>
      </div>
    </section></main>`;
  let callType = 'video';
  root.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => {
    callType = button.dataset.type;
    root.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  root.querySelector('#call-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const targetUserId = root.querySelector('#target-user').value.trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(targetUserId) || targetUserId === state.identity.userId) {
      state.notice = targetUserId === state.identity.userId ? 'Choose another user to call.' : 'Enter a valid target user ID.';
      renderHome();
      return;
    }
    await createCall(targetUserId, callType);
  });
  root.querySelector('#change-identity').addEventListener('click', () => {
    sessionStorage.removeItem(IDENTITY_KEY);
    state.identity = null;
    state.sessions = [];
    renderOnboarding();
  });
  root.querySelector('#accept')?.addEventListener('click', () => acceptCall(state.incoming));
  root.querySelector('#decline')?.addEventListener('click', () => endSession(state.incoming, 'declined'));
  root.querySelectorAll('[data-session]').forEach((button) => button.addEventListener('click', () => {
    const session = state.sessions.find((item) => item.id === button.dataset.session);
    if (session && session.status !== 'ended') void acceptCall(session);
  }));
}

async function createCall(targetUserId, callType) {
  try {
    const payload = await request('/api/protocol/calls/create', {
      method: 'POST',
      body: JSON.stringify({
        hostUserId: state.identity.userId,
        targetUserId,
        displayName: state.identity.displayName,
        duration: 30,
        capacity: 2,
        eventType: 'conference',
        callType,
      }),
    });
    await enterCall(payload.session);
  } catch (error) {
    state.notice = error.message;
    renderHome();
  }
}

async function acceptCall(session) {
  if (!session) return;
  try {
    const payload = await request('/api/protocol/calls/accept', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.id, userId: state.identity.userId }),
    });
    await enterCall(payload.data);
  } catch (error) {
    state.notice = error.message;
    renderHome();
  }
}

async function enterCall(session) {
  state.active = session;
  state.incoming = null;
  state.notice = '';
  state.phase = session.status === 'ringing' ? 'Ringing…' : 'Connecting securely…';
  state.remotePrimary = true;
  state.remoteScreenActive = false;
  state.miniOffset = { x: 0, y: 0 };
  renderCall();
  try {
    const constraints = session.callType === 'audio'
      ? { audio: true, video: false }
      : { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } };
    state.localStream = state.liveValidation
      ? await createStagingValidationStream(session)
      : await navigator.mediaDevices.getUserMedia(constraints);
    renderMedia();
    const prepared = await request('/api/protocol/prepare', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        userId: state.identity.userId,
        displayName: state.identity.displayName,
      }),
    });
    state.publisher = await publishWhip({ ...prepared.data.publisher, stream: state.localStream });
    state.phase = session.status === 'ringing' ? `Calling ${peerName(session)}…` : 'Waiting for peer media…';
    updateCallStatus();
    await pollPeerMedia();
  } catch (error) {
    state.notice = error.message;
    state.phase = 'Connection issue';
    updateCallStatus();
  }
}

async function pollPeerMedia() {
  if (!root || !state.active) return;
  try {
    const payload = await request(`/api/protocol/sessions/${encodeURIComponent(state.active.id)}/peer?userId=${encodeURIComponent(state.identity.userId)}`);
    const remoteScreenActive = payload.data.peerPresentation?.screenActive === true;
    const presentationChanged = state.remoteScreenActive !== remoteScreenActive;
    state.remoteScreenActive = remoteScreenActive;
    if (payload.data.ready) {
      let playbackStarted = false;
      if (!state.playback) {
        state.playback = await consumeWhep({
          ...payload.data.playback,
          video: root?.querySelector('#remote-video'),
        });
        state.remoteStream = state.playback.stream;
        playbackStarted = true;
      }
      state.phase = 'Live';
      if (presentationChanged || playbackStarted) renderMedia();
      updateCallStatus();
    } else {
      state.phase = payload.data.reason === 'peer_media_not_active' ? 'Peer is connecting media…' : `Calling ${peerName(state.active)}…`;
      if (presentationChanged) renderMedia();
      updateCallStatus();
    }
  } catch (error) {
    state.notice = error.message;
    updateCallStatus();
  }
  if (root && state.active) state.peerTimer = window.setTimeout(pollPeerMedia, 1_000);
}

function renderCall() {
  if (!root) return;
  const peer = peerName(state.active);
  root.innerHTML = `<main class="call-shell">
    <header class="call-header"><div class="call-peer"><span class="avatar large">${initials(peer)}</span><div><strong>${peer}</strong><small>${state.active.callType === 'audio' ? 'Audio call' : 'Video call'} · <span id="call-state">${state.phase}</span></small></div></div><span id="live-state" class="live-state"><i></i><b>${state.phase === 'Live' ? 'Live' : 'Securing call'}</b></span></header>
    <section id="media-stage" class="media-stage empty">
      <button id="main-media" class="main-media" aria-label="Main call media. Double-tap to swap with the mini preview."><video id="main-video" autoplay playsinline></video><span id="main-label" class="surface-label"></span></button>
      <div id="empty-state" class="empty-state"><span class="avatar hero">${initials(peer)}</span><strong id="empty-title">Preparing your private call</strong><p>WHIP publish and WHEP playback negotiate directly with MediaSFU.</p></div>
      <button id="mini-media" class="mini-media hidden" aria-label="Your movable mini preview. Double-tap to swap."><video id="mini-video" autoplay playsinline muted></video><span id="mini-label">You</span><i class="preview-grip">⋮⋮</i></button>
      <button id="play-remote" class="play-remote hidden">▶ Play remote audio &amp; video</button>
      <span id="protocol-badge" class="media-badge ${state.preview || state.liveValidation ? 'preview' : ''}">${state.preview ? 'UI preview · synthetic · not live' : state.liveValidation ? 'Staging WHIP/WHEP · synthetic media' : 'WHIP publish · WHEP play'}</span>
    </section>
    <p id="gesture-hint" class="gesture-hint hidden">Double-tap to swap views · Drag the small view to move it</p>
    <p id="call-notice" class="notice floating hidden" role="alert"></p>
    <nav class="call-controls" aria-label="Call controls">
      <button id="mic-control" class="control active"><span>●</span><b>Mute</b></button>
      ${state.active.callType === 'video' ? '<button id="camera-control" class="control active"><span>▰</span><b>Camera off</b></button>' : ''}
      ${state.active.callType === 'video' ? '<button id="screen-control" class="control"><span>▣</span><b>Share screen</b></button>' : ''}
      <button id="end-control" class="control end"><span>☎</span><b>End</b></button>
    </nav>
    <p class="protocol-note">No MediaSFU SDK: the backend provisions short-lived resources; this browser publishes with WHIP and plays the other person with WHEP.</p>
  </main>`;
  wireCallInteractions();
  renderMedia();
  updateCallStatus();
}

function wireDoubleActivation(element, action) {
  let previousTap = 0;
  let down = null;
  // Pointer-up timing covers touch, pen, and mouse consistently. Prevent the
  // browser's synthetic dblclick default, but do not run the action twice.
  element.addEventListener('dblclick', (event) => event.preventDefault());
  element.addEventListener('pointerdown', (event) => { down = { x: event.clientX, y: event.clientY }; });
  element.addEventListener('pointerup', (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const now = performance.now();
    if (now - previousTap < 340) { previousTap = 0; action(); } else previousTap = now;
  });
}

function wireCallInteractions() {
  const main = root.querySelector('#main-media');
  const mini = root.querySelector('#mini-media');
  const swap = () => {
    const presentation = resolveScreenPresentation({
      localScreenActive: Boolean(state.screenStream),
      remoteScreenActive: state.remoteScreenActive,
    });
    if (presentation.swapLocked || !state.localStream || !state.remoteStream) return;
    state.remotePrimary = !state.remotePrimary;
    renderMedia();
  };
  wireDoubleActivation(main, swap);
  wireDoubleActivation(mini, swap);
  let drag = null;
  mini.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { ...state.miniOffset } };
    mini.setPointerCapture?.(event.pointerId);
  });
  mini.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const stage = root.querySelector('#media-stage').getBoundingClientRect();
    const preview = mini.getBoundingClientRect();
    state.miniOffset = clampMiniOffset({
      x: drag.origin.x + event.clientX - drag.x,
      y: drag.origin.y + event.clientY - drag.y,
    }, stage, preview);
    mini.style.transform = `translate3d(${state.miniOffset.x}px, ${state.miniOffset.y}px, 0)`;
  });
  const stopDrag = (event) => {
    if (drag?.id === event.pointerId) mini.releasePointerCapture?.(event.pointerId);
    drag = null;
  };
  mini.addEventListener('pointerup', stopDrag);
  mini.addEventListener('pointercancel', stopDrag);
  root.querySelector('#mic-control').addEventListener('click', () => {
    const track = state.localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const button = root.querySelector('#mic-control');
    button.classList.toggle('active', track.enabled);
    button.querySelector('b').textContent = track.enabled ? 'Mute' : 'Unmute';
    button.querySelector('span').textContent = track.enabled ? '●' : '○';
  });
  root.querySelector('#camera-control')?.addEventListener('click', () => {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const button = root.querySelector('#camera-control');
    button.classList.toggle('active', track.enabled);
    button.querySelector('b').textContent = track.enabled ? 'Camera off' : 'Camera on';
  });
  root.querySelector('#screen-control')?.addEventListener('click', () => void toggleScreenShare());
  root.querySelector('#end-control').addEventListener('click', () => finishCall(true));
  root.querySelector('#play-remote').addEventListener('click', async () => {
    for (const video of root.querySelectorAll('video')) {
      if (video.srcObject === state.remoteStream) {
        video.muted = false;
        await video.play().catch(() => undefined);
      }
    }
    root.querySelector('#play-remote').classList.add('hidden');
  });
}

async function toggleScreenShare() {
  const button = root?.querySelector('#screen-control');
  if (!button || !state.publisher) return;
  try {
    if (state.screenStream) {
      const camera = state.localStream?.getVideoTracks()[0] || null;
      const sender = state.publisher.peer.getSenders().find((item) => item.track?.kind === 'video');
      await publishScreenState(false);
      await sender?.replaceTrack(camera);
      state.screenStream.getTracks().forEach((track) => track.stop());
      state.screenStream = null;
      button.classList.remove('active');
      button.querySelector('b').textContent = 'Share screen';
      renderMedia();
      return;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) throw new Error('Screen capture returned no video track.');
    const sender = state.publisher.peer.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender) throw new Error('The active WHIP publisher has no video sender.');
    await sender.replaceTrack(screenTrack);
    try {
      await publishScreenState(true);
    } catch (error) {
      await sender.replaceTrack(state.localStream?.getVideoTracks()[0] || null);
      display.getTracks().forEach((track) => track.stop());
      throw error;
    }
    state.screenStream = display;
    button.classList.add('active');
    button.querySelector('b').textContent = 'Stop sharing';
    screenTrack.addEventListener('ended', () => {
      if (state.screenStream === display) void toggleScreenShare();
    }, { once: true });
    renderMedia();
  } catch (error) {
    state.notice = error.message;
    updateCallStatus();
  }
}

async function publishScreenState(screenActive) {
  if (!state.active || !state.identity) throw new Error('No active call can publish screen state.');
  await request(`/api/protocol/sessions/${encodeURIComponent(state.active.id)}/presentation`, {
    method: 'POST',
    body: JSON.stringify({ userId: state.identity.userId, screenActive }),
  });
}

function attachVideo(video, stream, muted, mirror, screen = false) {
  if (video.srcObject !== stream) video.srcObject = stream;
  video.muted = muted || state.preview;
  video.classList.toggle('mirror', mirror);
  video.classList.toggle('screen', screen);
  video.play?.().catch?.(() => {
    if (!muted && !state.preview) {
      video.muted = true;
      video.play?.().catch?.(() => {});
      root?.querySelector('#play-remote')?.classList.remove('hidden');
    }
  });
}

function renderMedia() {
  if (!root || !state.active || !root.querySelector('#media-stage')) return;
  const stage = root.querySelector('#media-stage');
  const main = root.querySelector('#main-video');
  const mini = root.querySelector('#mini-video');
  const miniShell = root.querySelector('#mini-media');
  const empty = root.querySelector('#empty-state');
  const hasLocal = Boolean(state.localStream);
  const hasRemote = Boolean(state.remoteStream);
  const screenPresentation = resolveScreenPresentation({
    localScreenActive: Boolean(state.screenStream),
    remoteScreenActive: state.remoteScreenActive,
  });
  if (screenPresentation.primary === 'remote-screen' && state.remoteStream) {
    attachVideo(main, state.remoteStream, false, false, true);
    root.querySelector('#main-label').textContent = `${peerName(state.active)}'s screen`;
    if (state.localStream) {
      attachVideo(mini, state.localStream, true, true);
      root.querySelector('#mini-label').textContent = 'You';
      miniShell.classList.remove('hidden');
      miniShell.style.transform = `translate3d(${state.miniOffset.x}px, ${state.miniOffset.y}px, 0)`;
    } else miniShell.classList.add('hidden');
    empty.classList.add('hidden');
    main.parentElement.classList.remove('hidden');
    stage.classList.remove('empty');
    root.querySelector('#gesture-hint').classList.add('hidden');
    return;
  }
  if (screenPresentation.primary === 'local-screen' && state.screenStream) {
    const previewStream = state.remoteStream || state.localStream;
    attachVideo(main, state.screenStream, true, false, true);
    root.querySelector('#main-label').textContent = 'Your screen';
    if (previewStream) {
      const previewIsLocal = previewStream === state.localStream;
      attachVideo(mini, previewStream, previewIsLocal, previewIsLocal);
      root.querySelector('#mini-label').textContent = previewIsLocal ? 'You' : peerName(state.active);
      miniShell.classList.remove('hidden');
      miniShell.style.transform = `translate3d(${state.miniOffset.x}px, ${state.miniOffset.y}px, 0)`;
    } else miniShell.classList.add('hidden');
    empty.classList.add('hidden');
    main.parentElement.classList.remove('hidden');
    stage.classList.remove('empty');
    root.querySelector('#gesture-hint').classList.add('hidden');
    return;
  }
  if (!hasLocal && !hasRemote) {
    empty.classList.remove('hidden');
    main.parentElement.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  main.parentElement.classList.remove('hidden');
  stage.classList.remove('empty');
  if (hasLocal && hasRemote) {
    const mainStream = state.remotePrimary ? state.remoteStream : state.localStream;
    const miniStream = state.remotePrimary ? state.localStream : state.remoteStream;
    attachVideo(main, mainStream, !state.remotePrimary, !state.remotePrimary);
    attachVideo(mini, miniStream, state.remotePrimary, state.remotePrimary);
    root.querySelector('#main-label').textContent = state.remotePrimary ? peerName(state.active) : 'You';
    root.querySelector('#mini-label').textContent = state.remotePrimary ? 'You' : peerName(state.active);
    miniShell.classList.remove('hidden');
    root.querySelector('#gesture-hint').classList.remove('hidden');
    miniShell.style.transform = `translate3d(${state.miniOffset.x}px, ${state.miniOffset.y}px, 0)`;
  } else {
    const stream = state.remoteStream || state.localStream;
    const local = !state.remoteStream;
    attachVideo(main, stream, local, local);
    root.querySelector('#main-label').textContent = local ? 'You' : peerName(state.active);
    miniShell.classList.add('hidden');
    root.querySelector('#gesture-hint').classList.add('hidden');
  }
}

function updateCallStatus() {
  if (!root || !state.active || !root.querySelector('#call-state')) return;
  root.querySelector('#call-state').textContent = state.phase;
  const live = root.querySelector('#live-state');
  live.classList.toggle('ready', state.phase === 'Live');
  live.querySelector('b').textContent = state.phase === 'Live' ? 'Live' : 'Securing call';
  const notice = root.querySelector('#call-notice');
  notice.textContent = state.notice;
  notice.classList.toggle('hidden', !state.notice);
  const emptyTitle = root.querySelector('#empty-title');
  if (emptyTitle) emptyTitle.textContent = state.phase;
}

async function endSession(session, reason) {
  try {
    await request(`/api/sessions/${encodeURIComponent(session.id)}/end`, {
      method: 'POST', body: JSON.stringify({ userId: state.identity.userId, reason }),
    });
  } catch (error) { state.notice = error.message; }
  state.incoming = null;
  await pollSessions();
  renderHome();
}

async function finishCall(notifyBackend) {
  if (state.ending) return;
  state.ending = true;
  window.clearTimeout(state.peerTimer);
  const session = state.active;
  const playback = state.playback;
  const publisher = state.publisher;
  state.playback = null;
  state.publisher = null;
  await Promise.allSettled([playback?.stop?.(), publisher?.stop?.()]);
  state.localStream?.getTracks().forEach((track) => track.stop());
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.syntheticAudio?.oscillator?.stop?.();
  await state.syntheticAudio?.context?.close?.();
  state.syntheticAudio = null;
  state.localStream = null;
  state.remoteStream = null;
  state.screenStream = null;
  state.remoteScreenActive = false;
  if (notifyBackend && session) {
    try {
      await request(`/api/sessions/${encodeURIComponent(session.id)}/end`, {
        method: 'POST', body: JSON.stringify({ userId: state.identity.userId, reason: 'user_ended' }),
      });
    } catch (error) { state.notice = error.message; }
  }
  state.active = null;
  window.clearTimeout(state.peerTimer);
  state.phase = 'idle';
  state.ending = false;
  if (!root) return;
  await pollSessions();
  renderHome();
}

async function pollSessions() {
  if (!root || !state.identity) return;
  try {
    const payload = await request(`/api/users/${encodeURIComponent(state.identity.userId)}/sessions`);
    state.sessions = [...payload.data].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const current = state.active && state.sessions.find((session) => session.id === state.active.id);
    if (current) {
      state.active = current;
      if (current.status === 'ended' && !state.ending) await finishCall(false);
    } else if (!state.active) {
      state.incoming = state.sessions.find((session) => session.targetUserId === state.identity.userId && session.status === 'ringing') || null;
      if (root.querySelector('.home-shell')) renderHome();
    }
  } catch {
    if (!state.active) state.notice = 'Backend reconnecting…';
  }
}

function releasePageResources() {
  state.localStream?.getTracks().forEach((track) => track.stop());
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.syntheticAudio?.oscillator?.stop?.();
  state.syntheticAudio?.context?.close?.();
  state.publisher?.peer?.close?.();
  state.playback?.peer?.close?.();
  if (!state.preview && state.active && state.identity) {
    navigator.sendBeacon(
      `/api/sessions/${encodeURIComponent(state.active.id)}/end`,
      JSON.stringify({ userId: state.identity.userId, reason: 'page_closed' }),
    );
  }
}

function createPreviewStream(label, colors, preMirror = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  let frame = 0;
  const draw = () => {
    if (!state.preview && !state.liveValidation) return;
    frame += 1;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (preMirror) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.fillStyle = '#ffffff';
    context.font = '800 74px Manrope, sans-serif';
    context.fillText(label, 72, 130);
    context.font = '600 28px DM Sans, sans-serif';
    context.fillText(
      state.liveValidation
        ? 'Synthetic camera · real staging WHIP/WHEP transport'
        : 'Deterministic interaction preview · no room connected',
      76,
      180,
    );
    const x = 150 + ((frame * 8) % 960);
    context.beginPath();
    context.arc(x, 470, 74, 0, Math.PI * 2);
    context.fillStyle = '#5bf0a4';
    context.fill();
    context.restore();
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(15);
}

async function createStagingValidationStream(session) {
  const stream = new MediaStream();
  if (session.callType === 'video') {
    const seed = state.identity.userId.split('').reduce((total, character) => total + character.charCodeAt(0), 0);
    const palettes = [
      ['#124e78', '#10233f'],
      ['#166534', '#0d2818'],
      ['#7c2d12', '#32170e'],
    ];
    createPreviewStream(
      `You · ${state.identity.displayName}`,
      palettes[seed % palettes.length],
      true,
    ).getVideoTracks().forEach((track) => stream.addTrack(track));
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('This browser cannot create validation audio.');
  const context = new AudioContextConstructor();
  await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();
  oscillator.frequency.value = 220 + (state.identity.userId.length * 17);
  gain.gain.value = 0.015;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  state.syntheticAudio = { context, oscillator };
  return stream;
}

function startDevelopmentPreview() {
  if (!import.meta.env.DEV || query.get('preview') !== 'call') return false;
  state.preview = true;
  state.identity = { userId: 'alex-preview', displayName: 'Alex' };
  state.active = {
    id: 'preview-only', hostUserId: 'alex-preview', targetUserId: 'sam-preview',
    displayName: 'Alex', meetingId: 'not-a-room', callType: 'video', status: 'active',
  };
  state.phase = 'Interaction preview';
  renderCall();
  state.localStream = createPreviewStream('You · Alex', ['#164e3b', '#0d241c'], true);
  state.remoteStream = createPreviewStream('Sam · remote', ['#164b69', '#14243b']);
  state.remotePrimary = true;
  renderMedia();
  updateCallStatus();
  return true;
}

/**
 * Mount the framework-neutral familiar-call experience into a host element.
 * React, Angular, Vue, and the plain browser entry all use this same call,
 * protocol, media-presentation, gesture, and teardown implementation.
 */
export function mountFamiliarCall(element) {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('mountFamiliarCall requires an HTMLElement host.');
  }
  if (root) throw new Error('The familiar-call browser core is already mounted.');
  root = element;
  window.addEventListener('beforeunload', releasePageResources);
  if (!startDevelopmentPreview()) {
    if (state.identity) {
      renderHome();
      void pollSessions();
    } else renderOnboarding();
    pollInterval = window.setInterval(pollSessions, POLL_MS);
  }
  return () => {
    window.removeEventListener('beforeunload', releasePageResources);
    if (pollInterval !== null) window.clearInterval(pollInterval);
    pollInterval = null;
    window.clearTimeout(state.peerTimer);
    state.preview = false;
    state.liveValidation = false;
    releasePageResources();
    root.replaceChildren();
    root = null;
  };
}
