import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RTCView } from 'react-native-webrtc';
import { createCallApi } from './api';
import { NativeWhipWhepTransport } from './nativeTransport';
import { resolveProtocolMedia } from './presentation';
import { clampMiniOffset } from './protocol';

const IDENTITY_KEY = 'mediasfu-familiar-whip-whep-identity';
const USER_ID = /^[A-Za-z0-9_-]{2,64}$/;
const DISPLAY_NAME = /^[A-Za-z0-9]{2,10}$/;

const peerName = (session, userId) => session?.hostUserId === userId
  ? session?.targetUserId : session?.hostUserId;
const initials = value => String(value || '??').slice(0, 2).toUpperCase();

function Pill({ children, danger = false }) {
  return <View style={[styles.pill, danger && styles.pillDanger]}><Text style={styles.pillText}>{children}</Text></View>;
}

function Onboarding({ onComplete }) {
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const identity = { userId: userId.trim(), displayName: displayName.trim() };
    if (!USER_ID.test(identity.userId)) return setError('Use 2–64 letters, numbers, underscores, or hyphens for your user ID.');
    if (!DISPLAY_NAME.test(identity.displayName)) return setError('Use 2–10 letters or numbers for your display name.');
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    onComplete(identity);
  };
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor="#eef7f1" />
    <View style={styles.centered}>
      <View style={styles.brand}><Text style={styles.brandText}>M</Text></View>
      <Text style={styles.eyebrow}>MEDIA CALLS · WHIP + WHEP</Text>
      <Text style={styles.title}>Calls that feel instantly familiar.</Text>
      <Text style={styles.copy}>Choose a demo identity once. You call a person—not a room—and credentials stay on your backend.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Display name</Text>
        <TextInput testID="display-name" value={displayName} onChangeText={setDisplayName} placeholder="Alex" style={styles.input} />
        <Text style={styles.label}>Your user ID</Text>
        <TextInput testID="user-id" value={userId} onChangeText={setUserId} autoCapitalize="none" placeholder="alex-01" style={styles.input} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable testID="continue" onPress={submit} style={styles.primary}><Text style={styles.primaryText}>Continue to calls  →</Text></Pressable>
      </View>
      <Text style={styles.finePrint}>No MediaSFU client SDK is loaded. Media uses standards-based WHIP publishing and WHEP playback.</Text>
    </View>
  </SafeAreaView>;
}

function Home({ identity, sessions, incoming, notice, onCreate, onAccept, onDecline, onReset }) {
  const [targetUserId, setTargetUserId] = useState('');
  const [callType, setCallType] = useState('video');
  const [localError, setLocalError] = useState('');
  const submit = () => {
    const target = targetUserId.trim();
    if (!USER_ID.test(target) || target === identity.userId) {
      setLocalError(target === identity.userId ? 'Choose another person.' : 'Enter a valid contact user ID.');
      return;
    }
    setLocalError('');
    onCreate(target, callType);
  };
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor="#eef7f1" />
    <ScrollView contentContainerStyle={styles.home} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>PROTOCOL-NATIVE MEDIA</Text><Text style={styles.homeTitle}>Chats & calls</Text></View>
        <Pressable testID="change-identity" onPress={onReset} style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(identity.displayName)}</Text></View>
          <View><Text style={styles.identityName}>{identity.displayName}</Text><Text style={styles.identityId}>@{identity.userId}</Text></View>
        </Pressable>
      </View>
      <Pill>●  Ready for calls · WHIP/WHEP</Pill>
      {incoming && <View style={styles.incoming}>
        <Text style={styles.eyebrow}>INCOMING {String(incoming.callType).toUpperCase()} CALL</Text>
        <Text style={styles.incomingName}>{incoming.displayName || incoming.hostUserId}</Text>
        <Text style={styles.copy}>@{incoming.hostUserId} is calling</Text>
        <View style={styles.row}>
          <Pressable testID="decline" onPress={() => onDecline(incoming)} style={styles.secondary}><Text>Decline</Text></Pressable>
          <Pressable testID="accept" onPress={() => onAccept(incoming)} style={styles.primaryCompact}><Text style={styles.primaryText}>Accept call</Text></Pressable>
        </View>
      </View>}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Start a call</Text>
        <Text style={styles.copy}>Invite someone by their user ID. Room details stay invisible.</Text>
        <Text style={styles.label}>Who would you like to call?</Text>
        <TextInput testID="target-user" value={targetUserId} onChangeText={setTargetUserId} autoCapitalize="none" placeholder="friend-user-id" style={styles.input} />
        <View style={styles.row}>
          {['video', 'audio'].map(type => <Pressable key={type} onPress={() => setCallType(type)} style={[styles.typeButton, callType === type && styles.typeButtonActive]}>
            <Text style={callType === type ? styles.typeTextActive : styles.typeText}>{type === 'video' ? '▣  Video' : '●  Audio'}</Text>
          </Pressable>)}
        </View>
        {!!(localError || notice) && <Text style={styles.error}>{localError || notice}</Text>}
        <Pressable testID="call-now" onPress={submit} style={styles.primary}><Text style={styles.primaryText}>Call now  →</Text></Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent calls</Text>
        {!sessions.length && <Text style={styles.copy}>Your contact calls will appear here.</Text>}
        {sessions.slice(0, 8).map(session => <Pressable
          key={session.id}
          disabled={session.status === 'ended'}
          onPress={() => onAccept(session)}
          style={styles.sessionRow}
        >
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(peerName(session, identity.userId))}</Text></View>
          <View style={styles.flex}><Text style={styles.sessionName}>{peerName(session, identity.userId)}</Text><Text style={styles.sessionMeta}>{session.callType} · {session.status}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>)}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Surface({ surface, muted, style }) {
  if (!surface?.stream) return null;
  return <View style={style}>
    <RTCView
      testID={surface.isLocal ? 'local-video' : surface.kind === 'screen' ? 'screen-video' : 'remote-video'}
      streamURL={surface.stream.toURL()}
      objectFit={surface.kind === 'screen' ? 'contain' : 'cover'}
      mirror={surface.isLocal && surface.kind === 'camera'}
      muted={muted}
      style={StyleSheet.absoluteFill}
    />
    <Text style={styles.surfaceLabel}>{surface.label}</Text>
  </View>;
}

function CallScreen({ identity, session, transport, mediaState, onEnd }) {
  const [remotePrimary, setRemotePrimary] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(session.callType !== 'audio');
  const [screenOn, setScreenOn] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [mini, setMini] = useState({ width: 112, height: 154 });
  const miniOffset = useRef(new Animated.ValueXY()).current;
  const miniOffsetValue = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const projected = useMemo(() => resolveProtocolMedia({
    localStream: mediaState.localStream,
    remoteStream: mediaState.remoteStream,
    screenStream: mediaState.screenStream,
    remoteScreenActive: mediaState.remoteScreenActive,
    remotePrimary,
  }), [mediaState.localStream, mediaState.remoteStream, mediaState.screenStream, mediaState.remoteScreenActive, remotePrimary]);
  const activateSwap = () => {
    const now = Date.now();
    if (projected.canSwap && now - lastTap.current < 340) setRemotePrimary(value => !value);
    lastTap.current = now;
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => { dragStart.current = miniOffsetValue.current; },
    onPanResponderMove: (_, gesture) => {
      miniOffset.setValue(clampMiniOffset({ x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy }, stage, mini));
    },
    onPanResponderRelease: (_, gesture) => {
      const next = clampMiniOffset({ x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy }, stage, mini);
      miniOffsetValue.current = next;
      miniOffset.setValue(next);
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < 8) activateSwap();
    },
  })).current;
  useEffect(() => {
    if (projected.screenActive) setRemotePrimary(true);
  }, [projected.screenActive]);
  return <SafeAreaView style={styles.callSafe}>
    <StatusBar barStyle="light-content" backgroundColor="#071b13" />
    <View style={styles.callHeader}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(peerName(session, identity.userId))}</Text></View>
      <View style={styles.flex}><Text style={styles.callName}>{peerName(session, identity.userId)}</Text><Text style={styles.callStatus}>{session.callType} call · {mediaState.phase}</Text></View>
      <Pill danger={Boolean(mediaState.error)}>{mediaState.error ? 'Issue' : mediaState.phase === 'Live' ? '● Live' : 'Securing'}</Pill>
    </View>
    <View testID="media-stage" onLayout={event => setStage(event.nativeEvent.layout)} style={styles.stage}>
      {projected.primary ? <Pressable testID="main-media" onPress={activateSwap} style={StyleSheet.absoluteFill}>
        <Surface surface={projected.primary} muted style={StyleSheet.absoluteFill} />
      </Pressable> : <View style={styles.emptyCall}>
        <View style={styles.avatarHero}><Text style={styles.avatarHeroText}>{initials(peerName(session, identity.userId))}</Text></View>
        <ActivityIndicator color="#5fe197" />
        <Text style={styles.emptyTitle}>{mediaState.phase}</Text>
      </View>}
      {projected.mini && <Animated.View
        testID="mini-media"
        {...pan.panHandlers}
        onLayout={event => setMini(event.nativeEvent.layout)}
        style={[styles.mini, miniOffset.getLayout()]}
      ><Surface surface={projected.mini} muted style={StyleSheet.absoluteFill} /></Animated.View>}
      {projected.remoteAudioStream && <RTCView
        testID="remote-audio-sink"
        streamURL={projected.remoteAudioStream.toURL()}
        objectFit="contain"
        muted={false}
        style={styles.audioSink}
      />}
      <View style={styles.protocolBadge}><Text style={styles.protocolBadgeText}>WHIP publish · WHEP play</Text></View>
    </View>
    {!!mediaState.error && <Text style={styles.callError}>{mediaState.error}</Text>}
    <Text style={styles.hint}>{projected.canSwap ? 'Double-tap either view to swap · drag the small view' : projected.screenActive ? 'Screen share stays on the main stage' : 'Waiting for both camera views'}</Text>
    <View style={styles.controls}>
      <Pressable testID="toggle-mic" onPress={() => setMicOn(transport.toggleAudio())} style={styles.control}><Text style={styles.controlIcon}>{micOn ? '●' : '○'}</Text><Text style={styles.controlText}>{micOn ? 'Mute' : 'Unmute'}</Text></Pressable>
      {session.callType !== 'audio' && <Pressable testID="toggle-camera" onPress={() => setCameraOn(transport.toggleVideo())} style={styles.control}><Text style={styles.controlIcon}>{cameraOn ? '▣' : '□'}</Text><Text style={styles.controlText}>{cameraOn ? 'Camera off' : 'Camera on'}</Text></Pressable>}
      {session.callType !== 'audio' && <Pressable testID="toggle-screen" onPress={async () => {
        try { setScreenOn(await transport.toggleScreen({ sessionId: session.id, userId: identity.userId })); } catch (error) { transport.snapshot('Screen sharing unavailable', error?.message || String(error)); }
      }} style={styles.control}><Text style={styles.controlIcon}>▤</Text><Text style={styles.controlText}>{screenOn ? 'Stop share' : 'Share screen'}</Text></Pressable>}
      <Pressable testID="end-call" onPress={onEnd} style={[styles.control, styles.end]}><Text style={styles.endIcon}>☎</Text><Text style={styles.endText}>End</Text></Pressable>
    </View>
    <Text style={styles.protocolNote}>SDK-free media: short-lived protocol resources come from your backend; account credentials never enter this app.</Text>
  </SafeAreaView>;
}

export default function FamiliarWhipWhepApp({ apiBaseUrl }) {
  const api = useMemo(() => createCallApi({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [identity, setIdentity] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState('');
  const [mediaState, setMediaState] = useState({ phase: 'Idle', error: '', localStream: null, remoteStream: null, screenStream: null, remoteScreenActive: false });
  const transport = useRef(null);
  const refresh = useCallback(async () => {
    if (!identity) return;
    try {
      const payload = await api.listSessions(identity.userId);
      setSessions([...payload.data].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      const current = active && payload.data.find(item => item.id === active.id);
      if (current?.status === 'ended') {
        await transport.current?.stop();
        transport.current = null;
        setActive(null);
      }
    } catch { if (!active) setNotice('Backend reconnecting…'); }
  }, [active, api, identity]);
  useEffect(() => { AsyncStorage.getItem(IDENTITY_KEY).then(value => { try { setIdentity(JSON.parse(value)); } catch {} }).finally(() => setReady(true)); }, []);
  useEffect(() => {
    if (!identity) return undefined;
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [identity, refresh]);
  useEffect(() => () => { transport.current?.stop(); }, []);
  const enter = async session => {
    setActive(session);
    setNotice('');
    const next = new NativeWhipWhepTransport({ api, onState: setMediaState });
    transport.current = next;
    try { await next.start({ session, identity }); } catch { /* rendered by transport state */ }
  };
  const create = async (targetUserId, callType) => {
    try {
      const payload = await api.createCall({ hostUserId: identity.userId, targetUserId, displayName: identity.displayName, callType });
      await enter(payload.session);
    } catch (error) { setNotice(error.message); }
  };
  const accept = async session => {
    if (!session || active) return;
    try {
      const payload = await api.acceptCall({ sessionId: session.id, userId: identity.userId });
      await enter(payload.data);
    } catch (error) { setNotice(error.message); }
  };
  const end = async (session = active, reason = 'user_ended') => {
    if (!session) return;
    const current = transport.current;
    transport.current = null;
    await current?.stop();
    try { await api.endCall({ sessionId: session.id, userId: identity.userId, reason }); } catch (error) { setNotice(error.message); }
    setActive(null);
    setMediaState({ phase: 'Idle', error: '', localStream: null, remoteStream: null, screenStream: null, remoteScreenActive: false });
    refresh();
  };
  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#237446" /></View>;
  if (!identity) return <Onboarding onComplete={setIdentity} />;
  if (active) return <CallScreen identity={identity} session={active} transport={transport.current} mediaState={mediaState} onEnd={() => end()} />;
  const incoming = sessions.find(session => session.targetUserId === identity.userId && session.status === 'ringing');
  return <Home
    identity={identity}
    sessions={sessions}
    incoming={incoming}
    notice={notice}
    onCreate={create}
    onAccept={accept}
    onDecline={session => end(session, 'declined')}
    onReset={async () => { await AsyncStorage.removeItem(IDENTITY_KEY); setIdentity(null); setSessions([]); }}
  />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: '#eef7f1' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }, home: { padding: 20, gap: 16 },
  brand: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#1f7a4d', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, brandText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  eyebrow: { color: '#288059', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, title: { color: '#10251c', fontSize: 34, fontWeight: '800', lineHeight: 39, textAlign: 'center', marginTop: 10 },
  copy: { color: '#5c7165', fontSize: 15, lineHeight: 22, marginTop: 7 }, finePrint: { color: '#6c8074', textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 18, maxWidth: 430 },
  card: { width: '100%', maxWidth: 600, backgroundColor: '#fff', borderRadius: 24, padding: 20, marginTop: 18, shadowColor: '#173b29', shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
  label: { color: '#334d3f', fontSize: 12, fontWeight: '700', marginTop: 13, marginBottom: 7 }, input: { borderWidth: 1, borderColor: '#cdded3', borderRadius: 14, backgroundColor: '#f8fbf9', color: '#10251c', paddingHorizontal: 14, paddingVertical: 12 },
  error: { color: '#a43d44', marginTop: 12, lineHeight: 19 }, primary: { backgroundColor: '#237446', borderRadius: 15, padding: 15, alignItems: 'center', marginTop: 18 }, primaryText: { color: '#fff', fontWeight: '800' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, homeTitle: { color: '#10251c', fontSize: 30, fontWeight: '800' }, identity: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderRadius: 18, padding: 8 },
  avatar: { width: 39, height: 39, borderRadius: 15, backgroundColor: '#d9f0e2', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#237446', fontWeight: '900' }, identityName: { color: '#18392a', fontWeight: '800' }, identityId: { color: '#789084', fontSize: 11 },
  pill: { alignSelf: 'flex-start', backgroundColor: '#dff4e7', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 }, pillDanger: { backgroundColor: '#f8d8da' }, pillText: { color: '#237446', fontSize: 11, fontWeight: '800' },
  incoming: { backgroundColor: '#173f2d', borderRadius: 24, padding: 20 }, incomingName: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 4 }, row: { flexDirection: 'row', gap: 10, marginTop: 14 }, secondary: { flex: 1, borderRadius: 14, backgroundColor: '#eef3ef', padding: 14, alignItems: 'center' }, primaryCompact: { flex: 1, borderRadius: 14, backgroundColor: '#2f9862', padding: 14, alignItems: 'center' },
  sectionTitle: { color: '#17392a', fontSize: 21, fontWeight: '800' }, typeButton: { flex: 1, backgroundColor: '#eef3ef', borderRadius: 13, padding: 12, alignItems: 'center' }, typeButtonActive: { backgroundColor: '#d7f1e1', borderWidth: 1, borderColor: '#49a978' }, typeText: { color: '#63786c' }, typeTextActive: { color: '#237446', fontWeight: '800' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#edf2ee', paddingVertical: 13 }, sessionName: { color: '#1c3a2b', fontWeight: '800' }, sessionMeta: { color: '#809287', fontSize: 12, textTransform: 'capitalize', marginTop: 2 }, chevron: { color: '#7c9586', fontSize: 27 },
  callSafe: { flex: 1, backgroundColor: '#071b13' }, callHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, callName: { color: '#fff', fontWeight: '800', fontSize: 18 }, callStatus: { color: '#a9c5b5', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  stage: { flex: 1, marginHorizontal: 12, borderRadius: 28, overflow: 'hidden', backgroundColor: '#102b20' }, emptyCall: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13 }, avatarHero: { width: 104, height: 104, borderRadius: 40, backgroundColor: '#23563c', alignItems: 'center', justifyContent: 'center' }, avatarHeroText: { color: '#b8efd0', fontSize: 38, fontWeight: '900' }, emptyTitle: { color: '#dff4e7', fontWeight: '700' },
  mini: { position: 'absolute', right: 14, top: 14, width: 112, height: 154, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#173b2b', elevation: 10 }, surfaceLabel: { position: 'absolute', left: 9, bottom: 8, color: '#fff', backgroundColor: '#0008', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, fontSize: 11, fontWeight: '800' },
  audioSink: { position: 'absolute', width: 1, height: 1, left: -2, bottom: -2, opacity: 0.01 }, protocolBadge: { position: 'absolute', left: 12, top: 12, backgroundColor: '#071b13cc', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }, protocolBadgeText: { color: '#b8efd0', fontSize: 10, fontWeight: '800' },
  hint: { color: '#91aa9c', textAlign: 'center', fontSize: 11, marginTop: 10 }, callError: { color: '#ffd2d5', textAlign: 'center', marginTop: 8 }, controls: { flexDirection: 'row', justifyContent: 'center', gap: 14, padding: 18 }, control: { width: 82, height: 66, borderRadius: 20, backgroundColor: '#173b2b', alignItems: 'center', justifyContent: 'center' }, controlIcon: { color: '#8fe1b3', fontSize: 20 }, controlText: { color: '#dff4e7', fontSize: 11, marginTop: 5 }, end: { backgroundColor: '#c8434c' }, endIcon: { color: '#fff', fontSize: 20 }, endText: { color: '#fff', fontSize: 11, marginTop: 5, fontWeight: '800' }, protocolNote: { color: '#6f8f7d', textAlign: 'center', fontSize: 10, lineHeight: 14, paddingHorizontal: 30, paddingBottom: 12 },
});
