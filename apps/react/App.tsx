import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioGrid, ModernMediasfuGeneric, useMediasfuHeadless } from 'mediasfu-reactjs';
import './app.css';
import './call-parity.css';

type Identity = { userId: string; displayName: string };
type CallType = 'audio' | 'video';
type Session = {
  id: string;
  hostUserId: string;
  targetUserId: string;
  displayName: string;
  meetingId: string;
  callType: CallType;
  status: 'ringing' | 'active' | 'ended';
  createdAt: string;
  updatedAt: string;
  endedAt?: string | null;
  endReason?: string | null;
};
type CallConfig =
  | { mode: 'create'; targetUserId: string; callType: CallType }
  | { mode: 'join'; session: Session; callType: CallType };
type ApiResult<T> = { success: true; data: T; session?: Session };
type MediaAction = () => Promise<{ ok: boolean; error?: string }>;
type VideoSurface = { stream: MediaStream; mode: 'screen' | 'remote' | 'local'; key: string };

const IDENTITY_KEY = 'mediasfu-familiar-call-identity';
const POLL_INTERVAL_MS = 1_500;
const PREVIEW_GAP = 14;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export function clampMiniOffset(
  offset: { x: number; y: number },
  stage: { width: number; height: number },
  preview: { width: number; height: number },
) {
  const baseLeft = Math.max(stage.width - preview.width - PREVIEW_GAP, 0);
  return {
    x: clamp(offset.x, -baseLeft, PREVIEW_GAP),
    y: clamp(offset.y, -PREVIEW_GAP, Math.max(stage.height - preview.height - PREVIEW_GAP, -PREVIEW_GAP)),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

const listSessions = (userId: string) =>
  request<ApiResult<Session[]>>(`/api/users/${encodeURIComponent(userId)}/sessions`);

const initials = (value: string) => value.slice(0, 2).toUpperCase() || '??';

function otherUser(session: Session, identity: Identity) {
  return session.hostUserId === identity.userId ? session.targetUserId : session.hostUserId;
}

function StreamVideo({ stream, mirror }: { stream: MediaStream; mirror: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    return () => {
      if (ref.current?.srcObject === stream) ref.current.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} muted={mirror} autoPlay playsInline className={mirror ? 'mirror' : ''} />;
}

function Onboarding({ onComplete }: { onComplete: (identity: Identity) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const identity = { displayName: displayName.trim(), userId: userId.trim() };
    if (!/^[A-Za-z0-9]{2,10}$/.test(identity.displayName)) {
      return setError('Use 2–10 letters or numbers for your display name.');
    }
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(identity.userId)) {
      return setError('Use 2–64 letters, numbers, underscores, or hyphens for your user ID.');
    }
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    onComplete(identity);
  };
  return <main className="onboarding-shell">
    <section className="onboarding-card">
      <div className="brand-mark">M</div>
      <p className="eyebrow">MediaSFU familiar calls</p>
      <h1>Calls that feel instantly familiar.</h1>
      <p className="supporting">Choose how friends identify you. Calls happen from your contacts screen—room IDs stay behind the scenes.</p>
      <form onSubmit={submit}>
        <label>Display name<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex" /></label>
        <label>Your user ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="alex-01" /></label>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary" type="submit">Continue to calls <span>→</span></button>
      </form>
      <small>Your app talks only to its own backend. MediaSFU API credentials never enter the browser.</small>
    </section>
  </main>;
}

function Home({
  identity, sessions, incoming, online, error, onCreate, onAccept, onDecline, onReset,
}: {
  identity: Identity;
  sessions: Session[];
  incoming: Session | null;
  online: boolean;
  error: string;
  onCreate: (targetUserId: string, callType: CallType) => void;
  onAccept: (session: Session) => void;
  onDecline: (session: Session) => void;
  onReset: () => void;
}) {
  const [target, setTarget] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [localError, setLocalError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const targetUserId = target.trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(targetUserId)) return setLocalError('Enter a valid target user ID.');
    if (targetUserId === identity.userId) return setLocalError('Choose another user to call.');
    setLocalError('');
    onCreate(targetUserId, callType);
  };
  return <main className="home-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="home-content">
      <header className="home-header">
        <div><p className="eyebrow">Media calls</p><h1>Chats & calls</h1></div>
        <button className="identity-chip" onClick={onReset} title="Change identity">
          <span className="avatar">{initials(identity.displayName)}</span>
          <span><strong>{identity.displayName}</strong><small>@{identity.userId}</small></span>
        </button>
      </header>
      <div className={`connection-pill ${online ? '' : 'offline'}`}><i />{online ? 'Ready for calls' : 'Backend reconnecting…'}</div>

      {incoming && <article className="incoming-card" data-testid="incoming-call">
        <div className="incoming-person"><span className="avatar large">{initials(incoming.displayName)}</span><div><p className="eyebrow">Incoming {incoming.callType} call</p><h2>{incoming.displayName}</h2><span>@{incoming.hostUserId} is calling</span></div></div>
        <div className="incoming-actions">
          <button className="decline" onClick={() => onDecline(incoming)}>Decline</button>
          <button className="accept" onClick={() => onAccept(incoming)}>Accept call</button>
        </div>
      </article>}

      <div className="home-grid">
        <section className="composer-card">
          <div className="card-heading"><div><h2>Start a call</h2><p>Invite someone by their user ID</p></div><span className="phone-mark">☎</span></div>
          <form onSubmit={submit}>
            <label>Who would you like to call?<input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="friend-user-id" /></label>
            <div className="call-type" role="group" aria-label="Call type">
              <button type="button" className={callType === 'video' ? 'selected' : ''} onClick={() => setCallType('video')}><span>▰</span> Video</button>
              <button type="button" className={callType === 'audio' ? 'selected' : ''} onClick={() => setCallType('audio')}><span>●</span> Audio</button>
            </div>
            {(localError || error) && <p className="notice" role="alert">{localError || error}</p>}
            <button className="primary" type="submit">Call now <span>→</span></button>
          </form>
        </section>

        <section className="recent-card">
          <div className="card-heading"><div><h2>Recent calls</h2><p>Session details only—never call media</p></div><span className="count">{sessions.length}</span></div>
          <div className="session-list">
            {sessions.length ? sessions.map((session) => <button className="session-row" key={session.id} disabled={session.status === 'ended'} onClick={() => onAccept(session)}>
              <span className="avatar">{initials(otherUser(session, identity))}</span>
              <span className="session-copy"><strong>{otherUser(session, identity)}</strong><small>{session.callType === 'audio' ? 'Audio' : 'Video'} · {session.status === 'ended' ? 'Ended' : session.status === 'active' ? 'Connected' : 'Ringing'}</small></span>
              <time>{new Date(session.updatedAt || session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </button>) : <div className="empty-history"><span>☏</span><strong>Your recent calls appear here</strong><p>Call a contact to get started.</p></div>}
          </div>
        </section>
      </div>
    </section>
  </main>;
}

export default function App() {
  const room = useMediasfuHeadless();
  const [identity, setIdentity] = useState<Identity | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || 'null'); } catch { return null; }
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [incoming, setIncoming] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [callConfig, setCallConfig] = useState<CallConfig | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const [demoActive, setDemoActive] = useState(false);
  const roomRequestRef = useRef<Promise<any> | null>(null);
  const roleAssignmentRef = useRef<CallConfig | null>(null);
  const mediaInitializationRef = useRef<CallConfig | null>(null);
  const activeSessionRef = useRef<Session | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const demoTimerRef = useRef<number | null>(null);
  const demoStreamRef = useRef<MediaStream | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [miniOffset, setMiniOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const stageSizeRef = useRef({ width: 0, height: 0 });
  const miniSizeRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  useEffect(() => {
    if (!identity) return;
    let mounted = true;
    const poll = async () => {
      try {
        const payload = await listSessions(identity.userId);
        if (!mounted) return;
        const next = [...payload.data].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        setSessions(next);
        setOnline(true);
        const ringing = next.find((session) => session.targetUserId === identity.userId && session.status === 'ringing');
        setIncoming(callConfig ? null : ringing || null);
        const current = activeSessionRef.current;
        if (current) {
          const updated = next.find((session) => session.id === current.id);
          if (updated) setActiveSession(updated);
          if (updated?.status === 'ended') {
            setCallConfig(null); room.updateSourceParameters({});
          }
        }
      } catch { if (mounted) setOnline(false); }
    };
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [identity, callConfig]);

  const surfaces = useMemo<VideoSurface[]>(() => {
    const next: VideoSurface[] = [];
    if (room.screenShare.stream) next.push({ stream: room.screenShare.stream, mode: 'screen', key: `screen-${room.screenShare.stream.id}` });
    if (room.remoteVideos[0]?.stream) next.push({ stream: room.remoteVideos[0].stream, mode: 'remote', key: `remote-${room.remoteVideos[0].producerId || room.remoteVideos[0].stream.id}` });
    if (room.localVideo) next.push({ stream: room.localVideo, mode: 'local', key: `local-${room.localVideo.id}` });
    return next;
  }, [room.screenShare, room.remoteVideos, room.localVideo]);
  const screenActive = surfaces[0]?.mode === 'screen';
  const normalizedFocus = screenActive ? 0 : Math.min(focusIndex, Math.max(surfaces.length - 1, 0));
  const primary = surfaces[normalizedFocus] || null;
  const previews = surfaces.filter((_, index) => index !== normalizedFocus);
  const canSwapFocus = !screenActive && surfaces.length > 1;

  useEffect(() => {
    if (screenActive || focusIndex >= surfaces.length) setFocusIndex(0);
  }, [focusIndex, screenActive, surfaces.length]);

  const measurePreview = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    const preview = miniRef.current?.getBoundingClientRect();
    if (!stage || !preview) return;
    stageSizeRef.current = { width: stage.width, height: stage.height };
    miniSizeRef.current = { width: preview.width, height: preview.height };
    setMiniOffset((current) => clampMiniOffset(current, stageSizeRef.current, miniSizeRef.current));
  }, []);

  useEffect(() => {
    measurePreview();
    window.addEventListener('resize', measurePreview);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measurePreview) : null;
    if (stageRef.current) observer?.observe(stageRef.current);
    if (miniRef.current) observer?.observe(miniRef.current);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measurePreview); };
  }, [measurePreview, previews.length]);

  const swapFocus = () => {
    if (!canSwapFocus) return;
    setFocusIndex((current) => current === 0 ? 1 : 0);
  };
  const startMiniDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: miniOffset.x, originY: miniOffset.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const moveMini = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMiniOffset(clampMiniOffset(
      { x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY },
      stageSizeRef.current,
      miniSizeRef.current,
    ));
  };
  const stopMiniDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  const preJoinOptions = useMemo(() => {
    if (!identity || !callConfig) return undefined;
    return callConfig.mode === 'create'
      ? { action: 'create' as const, userName: identity.displayName, duration: 30, capacity: 2, eventType: 'conference' as const }
      : { action: 'join' as const, userName: identity.displayName, meetingID: callConfig.session.meetingId };
  }, [identity, callConfig]);

  const createMediaSFURoom = async () => {
    if (!identity || callConfig?.mode !== 'create') return { success: false, data: { error: 'Call setup is incomplete.' } };
    if (!roomRequestRef.current) roomRequestRef.current = request<ApiResult<unknown>>('/api/rooms/create', {
      method: 'POST',
      body: JSON.stringify({
        hostUserId: identity.userId, targetUserId: callConfig.targetUserId,
        displayName: identity.displayName, duration: 30, capacity: 2,
        eventType: 'conference', callType: callConfig.callType,
      }),
    });
    try {
      const payload = await roomRequestRef.current;
      setActiveSession(payload.session || null);
      setSessions((current) => payload.session ? [payload.session, ...current.filter((item) => item.id !== payload.session.id)] : current);
      return { success: true, data: payload.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create the call.';
      setNotice(message);
      return { success: false, data: { error: message } };
    }
  };

  const joinMediaSFURoom = async () => {
    if (!identity || callConfig?.mode !== 'join') return { success: false, data: { error: 'Call setup is incomplete.' } };
    if (!roomRequestRef.current) roomRequestRef.current = request<ApiResult<unknown>>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ sessionId: callConfig.session.id, userId: identity.userId, displayName: identity.displayName }),
    });
    try {
      const payload = await roomRequestRef.current;
      setActiveSession(payload.session || callConfig.session);
      return { success: true, data: payload.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join the call.';
      setNotice(message);
      return { success: false, data: { error: message } };
    }
  };

  const updateSourceParameters = (parameters: any) => {
    const next = parameters || {};
    room.updateSourceParameters(next);
    if (callConfig && roleAssignmentRef.current !== callConfig && typeof next.updateIslevel === 'function') {
      next.updateIslevel(callConfig.mode === 'create' ? '2' : '1');
      roleAssignmentRef.current = callConfig;
    }
    if (callConfig && next.validated && mediaInitializationRef.current !== callConfig) {
      mediaInitializationRef.current = callConfig;
      const actions: Promise<unknown>[] = [];
      if (!next.audioAlreadyOn && typeof next.clickAudio === 'function') actions.push(room.controls.toggleMic());
      if (callConfig.callType === 'video' && !next.videoAlreadyOn && typeof next.clickVideo === 'function') actions.push(room.controls.toggleCamera());
      Promise.allSettled(actions).catch(() => undefined);
    }
  };

  const beginCall = (config: CallConfig) => {
    setNotice(''); setIncoming(null); setActiveSession(config.mode === 'join' ? config.session : null);
    roomRequestRef.current = null; roleAssignmentRef.current = null; mediaInitializationRef.current = null;
    room.updateSourceParameters({}); setCallConfig(config);
  };

  const decline = async (session: Session) => {
    if (!identity) return;
    try {
      await request(`/api/sessions/${encodeURIComponent(session.id)}/end`, {
        method: 'POST', body: JSON.stringify({ userId: identity.userId, reason: 'declined' }),
      });
      setIncoming(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not decline the call.'); }
  };

  const run = async (action: MediaAction) => {
    const result = await action();
    setNotice(result.ok ? '' : result.error || 'The action could not be completed.');
  };

  const toggleDemoVideo = async () => {
    if (demoActive) {
      if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
      demoStreamRef.current?.getTracks().forEach((track) => track.stop());
      demoStreamRef.current = null;
      const result = await room.produce.stop('video');
      setDemoActive(false); setNotice(result.ok ? '' : result.error || 'Could not stop test media.');
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return setNotice('The media test canvas is unavailable.');
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
      context.fillText(`${identity?.displayName || 'Caller'} · WebRTC test producer`, 80, 320);
      context.beginPath(); context.arc(130 + ((frame * 9) % 980), 520, 54, 0, Math.PI * 2);
      context.fillStyle = '#5bf0a4'; context.fill();
    };
    draw(); demoTimerRef.current = window.setInterval(draw, 100);
    const result = await room.produce.canvas(canvas, 15);
    if (!result.ok) {
      if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null; return setNotice(result.error || 'Could not publish test media.');
    }
    demoStreamRef.current = result.stream; setDemoActive(true); setNotice('');
  };

  const finishCall = async () => {
    if (demoActive) await toggleDemoVideo();
    if (room.ready) await room.controls.leave().catch(() => undefined);
    if (activeSession?.id && identity) {
      try {
        await request(`/api/sessions/${encodeURIComponent(activeSession.id)}/end`, {
          method: 'POST', body: JSON.stringify({ userId: identity.userId, reason: 'user_ended' }),
        });
      } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not close the call session.'); }
    }
    setCallConfig(null); setActiveSession(null); roomRequestRef.current = null;
    roleAssignmentRef.current = null; mediaInitializationRef.current = null; room.updateSourceParameters({});
  };

  useEffect(() => () => {
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
    demoStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  if (!identity) return <Onboarding onComplete={setIdentity} />;

  if (!callConfig) return <Home
    identity={identity} sessions={sessions} incoming={incoming} online={online} error={notice}
    onCreate={(targetUserId, callType) => beginCall({ mode: 'create', targetUserId, callType })}
    onAccept={(session) => beginCall({ mode: 'join', session, callType: session.callType || 'video' })}
    onDecline={decline}
    onReset={() => { sessionStorage.removeItem(IDENTITY_KEY); setIdentity(null); setSessions([]); }}
  />;

  const peerName = callConfig.mode === 'create' ? callConfig.targetUserId : otherUser(callConfig.session, identity);
  const callState = notice ? 'Connection issue' : room.ready ? 'Connected' : activeSession?.status === 'ringing' ? 'Ringing…' : 'Connecting securely…';

  return <>
    <div className="engine" aria-hidden>
      <ModernMediasfuGeneric
        connectMediaSFU returnUI={false} noUIPreJoinOptions={preJoinOptions}
        createMediaSFURoom={createMediaSFURoom} joinMediaSFURoom={joinMediaSFURoom}
        sourceParameters={room.sourceParameters} updateSourceParameters={updateSourceParameters}
        onMediaChanged={room.onMediaChanged}
      />
    </div>
    <main className="call-shell">
      <header className="call-header">
        <div className="call-peer"><span className="avatar large">{initials(peerName)}</span><div><strong>{peerName}</strong><small>{callConfig.callType === 'audio' ? 'Audio call' : 'Video call'} · {callState}</small></div></div>
        <span className={`live-state ${room.ready ? 'ready' : ''}`}><i />{room.ready ? 'Live' : 'Securing call'}</span>
      </header>
      <section ref={stageRef} className={`media-stage ${primary?.mode || 'empty'}`} data-focus-index={normalizedFocus}>
        {primary
          ? <button type="button" className="main-media" onDoubleClick={swapFocus} aria-label="Main call media. Double-click or double-tap to swap with the mini preview."><StreamVideo stream={primary.stream} mirror={primary.mode === 'local' && !demoActive} /></button>
          : <div className="empty-state"><span className="avatar hero">{initials(peerName)}</span><strong>{activeSession?.status === 'ringing' ? `Calling ${peerName}…` : 'Preparing your private call'}</strong><p>{room.readiness.reason || 'Waiting for MediaSFU media readiness.'}</p></div>}
        <span className="media-badge">{primary?.mode === 'screen' ? 'Screen share' : primary?.mode === 'remote' ? peerName : primary?.mode === 'local' ? (demoActive ? 'Media test' : 'You') : 'Waiting'}</span>
        {previews.length > 0 && <div ref={miniRef} className="media-previews" style={{ transform: `translate3d(${miniOffset.x}px, ${miniOffset.y}px, 0)` }} onPointerDown={startMiniDrag} onPointerMove={moveMini} onPointerUp={stopMiniDrag} onPointerCancel={stopMiniDrag} aria-label="Other call views. Drag to move.">
          {previews.map((surface, index) => <button type="button" key={surface.key} className="mini-media" onDoubleClick={index === 0 ? swapFocus : undefined} onClick={() => { if (screenActive) return; const sourceIndex = surfaces.indexOf(surface); if (sourceIndex >= 0) setFocusIndex(sourceIndex); }} aria-label={index === 0 ? 'Mini call media. Double-click or double-tap to swap with the main media.' : `Focus call preview ${index + 1}`}><StreamVideo stream={surface.stream} mirror={surface.mode === 'local' && !demoActive} /><span>{surface.mode === 'local' ? 'You' : surface.mode === 'remote' ? peerName : 'Screen'}</span></button>)}
          <i className="preview-grip" aria-hidden>⋮⋮</i>
        </div>}
      </section>
      {previews.length > 0 && <p className="gesture-hint">Double-tap to swap views · Drag the small view to move it</p>}
      {notice && <p className="notice floating" role="alert">{notice}</p>}
      <nav className="call-controls" aria-label="Call controls">
        <button disabled={!room.ready} onClick={() => run(room.controls.toggleMic)} className={room.micOn ? 'control active' : 'control'}><span>{room.micOn ? '●' : '○'}</span>{room.micOn ? 'Mute' : 'Unmute'}</button>
        {callConfig.callType === 'video' && <button disabled={!room.ready} onClick={() => run(room.controls.toggleCamera)} className={room.cameraOn ? 'control active' : 'control'}><span>▰</span>{room.cameraOn ? 'Camera off' : 'Camera on'}</button>}
        <button disabled={!room.ready} onClick={() => run(room.controls.toggleScreenShare)} className="control"><span>⇧</span>Share</button>
        <button disabled={!room.ready} onClick={toggleDemoVideo} className={demoActive ? 'control active test-control' : 'control test-control'}><span>◇</span>{demoActive ? 'Stop test' : 'Test media'}</button>
        <button onClick={finishCall} className="control end"><span>☎</span>End</button>
      </nav>
      <p className="test-note">“Test media” publishes an animated canvas through the real room for repeatable two-device verification.</p>
      <div className="audio-mount" aria-hidden><AudioGrid componentsToRender={room.audioComponents} /></div>
      <canvas ref={canvasRef} width={1280} height={720} aria-hidden className="test-canvas" />
    </main>
  </>;
}
