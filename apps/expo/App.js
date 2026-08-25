import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ShellIcon from './ShellIcon';
import {
  ModernMediasfuGeneric,
  PreJoinPage,
  useMediasfuHeadless,
} from 'mediasfu-reactnative-expo';
import CallInterface from './CallInterface';
import {
  createSession,
  endSession,
  joinSession,
  listSessions,
} from './src/api';
import { connectCallSocket } from './src/socket';
import { loadIdentity, saveIdentity } from './src/storage';
import { isValidDisplayName, isValidUserId } from './src/validation';

const CALL_DURATION_MINUTES = 5;
const CALL_CAPACITY = 2;

function initials(value = '') {
  return value.slice(0, 2).toUpperCase() || '??';
}
function sessionLabel(session, currentUserId) {
  if (session.targetUserId === currentUserId)
    return session.displayName || session.hostUserId || 'Unknown contact';
  if (session.hostUserId === currentUserId)
    return session.targetUserId || 'Unknown contact';
  return (
    session.displayName ||
    session.targetUserId ||
    session.hostUserId ||
    'Unknown contact'
  );
}
function sessionTime(session) {
  const date = session.updatedAt || session.createdAt;
  return date
    ? new Date(date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'Recent';
}
function Chip({ children }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
}
function Avatar({ label, large = false }) {
  return (
    <View style={[styles.avatar, large && styles.avatarLarge]}>
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>
        {initials(label)}
      </Text>
    </View>
  );
}
function Icon({ name, size = 20, color = '#237446' }) {
  return <ShellIcon name={name} size={size} color={color} />;
}

function Onboarding({ onComplete }) {
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const identity = { userId: userId.trim(), displayName: displayName.trim() };
    if (!isValidUserId(identity.userId))
      return setError('User ID: use 2-64 letters, numbers, _ or -.');
    if (!isValidDisplayName(identity.displayName))
      return setError('Display name: use 2-10 letters or numbers only.');
    await saveIdentity(identity);
    onComplete(identity);
  };
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8f4" />
      <View style={styles.textureOne} />
      <View style={styles.textureTwo} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.onboarding}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>M</Text>
          </View>
          <Text style={styles.kicker}>MEDIA CALLS, MADE SIMPLE</Text>
          <Text style={styles.heroTitle}>Your calls, in one calm place.</Text>
          <Text style={styles.heroCopy}>
            Choose your identity once. Then create or accept calls without
            putting cloud credentials on your phone.
          </Text>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Set up your profile</Text>
            <Text style={styles.fieldLabel}>User ID</Text>
            <TextInput
              testID="user-id"
              value={userId}
              onChangeText={setUserId}
              placeholder="e.g. alex_01"
              placeholderTextColor="#91a296"
              autoCapitalize="none"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              testID="display-name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="2-10 letters or numbers"
              placeholderTextColor="#91a296"
              autoCapitalize="none"
              style={styles.input}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              testID="continue"
              onPress={submit}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Icon name="arrow-right" size={21} color="#fff" />
            </Pressable>
          </View>
          <Text style={styles.privacy}>
            The app talks to your backend proxy. API keys stay on the server.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SessionRow({ session, identity, onPress }) {
  const other =
    session.hostUserId === identity.userId
      ? session.targetUserId
      : session.hostUserId;
  const state =
    session.status === 'ended'
      ? 'Ended'
      : session.status === 'active'
      ? 'Connected'
      : 'Waiting';
  return (
    <Pressable onPress={onPress} style={styles.sessionRow}>
      <Avatar label={other} />
      <View style={styles.sessionMain}>
        <Text style={styles.sessionName}>{other || 'Unknown contact'}</Text>
        <Text style={styles.sessionMeta}>
          {state} | {sessionTime(session)}
        </Text>
      </View>
      <Icon name="chevron-right" size={24} color="#83a18d" />
    </Pressable>
  );
}

function Home({
  identity,
  sessions,
  socketState,
  onCreate,
  onAccept,
  onDecline,
  incoming,
  onResetIdentity,
}) {
  const [targetUserId, setTargetUserId] = useState('');
  const [callType, setCallType] = useState('video');
  const [error, setError] = useState('');
  const submit = () => {
    if (!isValidUserId(targetUserId))
      return setError('Enter a valid target user ID.');
    setError('');
    onCreate({ targetUserId: targetUserId.trim(), callType });
    setTargetUserId('');
  };
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8f4" />
      <View style={styles.textureOne} />
      <View style={styles.textureTwo} />
      <ScrollView
        contentContainerStyle={styles.home}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>MEDIA CALLS</Text>
            <Text style={styles.homeTitle}>Chats & calls</Text>
          </View>
          <Pressable
            testID="identity-button"
            onPress={onResetIdentity}
            style={styles.identityButton}
          >
            <Avatar label={identity.displayName} />
            <Text style={styles.identityName}>{identity.displayName}</Text>
          </Pressable>
        </View>
        <View style={styles.connectionPill}>
          <View
            style={[
              styles.connectionDot,
              socketState !== 'connected' && styles.connectionDotWarn,
            ]}
          />
          <Text style={styles.connectionText}>
            {socketState === 'connected'
              ? 'Ready for calls'
              : socketState === 'reconnecting'
              ? 'Reconnecting...'
              : 'Offline mode'}
          </Text>
        </View>
        {incoming && (
          <View testID="incoming-call" style={styles.incomingCard}>
            <View style={styles.incomingTop}>
              <Avatar
                label={
                  incoming.session?.displayName || incoming.session?.hostUserId
                }
              />
              <View style={styles.incomingCopy}>
                <Text style={styles.incomingEyebrow}>INCOMING CALL</Text>
                <Text style={styles.incomingName}>
                  {incoming.session?.displayName ||
                    incoming.session?.hostUserId}
                </Text>
                <Text style={styles.incomingMeta}>
                  Meeting ready | {incoming.session?.eventType || 'conference'}
                </Text>
              </View>
            </View>
            <View style={styles.incomingActions}>
              <Pressable
                testID="decline-call"
                onPress={onDecline}
                style={styles.decline}
              >
                <Text style={styles.declineText}>Decline</Text>
              </Pressable>
              <Pressable
                testID="accept-call"
                onPress={() => onAccept()}
                style={styles.accept}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.composerCard}>
          <View style={styles.composerHeader}>
            <View>
              <Text style={styles.composerTitle}>Start a call</Text>
              <Text style={styles.composerSubtitle}>
                Invite someone by their user ID
              </Text>
            </View>
            <View style={styles.composerIcon}>
              <Icon name="phone-plus" size={20} />
            </View>
          </View>
          <TextInput
            testID="target-user"
            value={targetUserId}
            onChangeText={setTargetUserId}
            placeholder="Target user ID"
            placeholderTextColor="#91a296"
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={styles.typeRow}>
            <Pressable
              testID="video-choice"
              onPress={() => setCallType('video')}
              style={[
                styles.typeButton,
                callType === 'video' && styles.typeButtonSelected,
              ]}
            >
              <Icon name="video-outline" size={18} />
              <Text style={styles.typeText}>Video</Text>
            </Pressable>
            <Pressable
              testID="audio-choice"
              onPress={() => setCallType('audio')}
              style={[
                styles.typeButton,
                callType === 'audio' && styles.typeButtonSelected,
              ]}
            >
              <Icon name="phone-outline" size={18} />
              <Text style={styles.typeText}>Audio</Text>
            </Pressable>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            testID="create-call"
            onPress={submit}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Create call</Text>
            <Icon name="arrow-right" size={21} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent calls</Text>
          <Chip>{sessions.length} saved</Chip>
        </View>
        <View style={styles.sessionsCard}>
          {sessions.length ? (
            sessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                identity={identity}
                onPress={() =>
                  session.status !== 'ended' && onAccept({ session })
                }
              />
            ))
          ) : (
            <View style={styles.empty}>
              <Icon name="phone-log-outline" size={34} color="#77a282" />
              <Text style={styles.emptyTitle}>
                Your recent calls appear here
              </Text>
              <Text style={styles.emptyCopy}>
                Create a call and invite someone to get started.
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.historyNote}>
          History stores session details only: people, meeting ID, status, times
          and end reason. It never stores call media.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [identity, setIdentity] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [incoming, setIncoming] = useState(null);
  const [socketState, setSocketState] = useState('connecting');
  const [activeSession, setActiveSession] = useState(null);
  const activeSessionRef = useRef(null);
  const [callConfig, setCallConfig] = useState(null);
  const room = useMediasfuHeadless();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [callError, setCallError] = useState('');
  const roleAssignmentRef = useRef(null);
  const mediaInitializationRef = useRef(null);
  useEffect(() => {
    loadIdentity()
      .then(setIdentity)
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);
  useEffect(() => {
    if (!identity) return undefined;
    let mounted = true;
    const mergeSessions = items => {
      if (!mounted || !Array.isArray(items)) return;
      setSessions(current => {
        const map = new Map(
          [...current, ...items].map(item => [item.id, item]),
        );
        return [...map.values()].sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0) -
            new Date(a.updatedAt || a.createdAt || 0),
        );
      });
    };
    listSessions(identity.userId)
      .then(payload => mergeSessions(payload.data || []))
      .catch(() => setSocketState('offline'));
    const socket = connectCallSocket({
      userId: identity.userId,
      onState: setSocketState,
      onInvite: payload => mounted && setIncoming(payload),
      onJoined: payload =>
        mergeSessions(
          payload.sessions || (payload.session ? [payload.session] : []),
        ),
      onEnded: payload => {
        mergeSessions(payload.session ? [payload.session] : []);
        if (mounted && activeSessionRef.current?.id === payload.session?.id)
          setCallConfig(null);
      },
    });
    return () => {
      mounted = false;
      socket?.disconnect();
    };
  }, [identity]);
  const preJoinOptions = useMemo(() => {
    if (!callConfig || !identity) return undefined;
    return callConfig.mode === 'join'
      ? {
          action: 'join',
          meetingID: callConfig.session?.meetingId,
          userName: identity.displayName,
        }
      : {
          action: 'create',
          duration: CALL_DURATION_MINUTES,
          capacity: CALL_CAPACITY,
          eventType: 'conference',
          userName: identity.displayName,
        };
  }, [callConfig, identity]);
  const startCreate = ({ targetUserId, callType }) => {
    setCallError('');
    setActiveSession(null);
    setCallConfig({ mode: 'create', targetUserId, callType });
    roleAssignmentRef.current = null;
    mediaInitializationRef.current = null;
    room.updateSourceParameters({});
  };
  const acceptIncoming = (payload = incoming) => {
    const session = payload?.session || payload;
    if (!session?.id) return;
    setIncoming(null);
    setCallError('');
    setActiveSession(session);
    setCallConfig({ mode: 'join', session });
    roleAssignmentRef.current = null;
    mediaInitializationRef.current = null;
    room.updateSourceParameters({});
  };
  const declineIncoming = async () => {
    if (!incoming?.session?.id || !identity) return setIncoming(null);
    try {
      await endSession({
        sessionId: incoming.session.id,
        userId: identity.userId,
        reason: 'declined',
      });
    } catch (error) {
      setCallError(error.message);
    }
    setIncoming(null);
  };
  const createMediaSFURoom = async () => {
    try {
      const payload = await createSession({
        hostUserId: identity.userId,
        targetUserId: callConfig.targetUserId,
        displayName: identity.displayName,
        duration: CALL_DURATION_MINUTES,
        capacity: CALL_CAPACITY,
      });
      setActiveSession(payload.session);
      setSessions(current => [
        payload.session,
        ...current.filter(item => item.id !== payload.session.id),
      ]);
      return { success: true, data: payload.data };
    } catch (error) {
      setCallError(error.message);
      return { success: false, data: { error: error.message } };
    }
  };
  const joinMediaSFURoom = async () => {
    try {
      const payload = await joinSession({
        sessionId: callConfig.session.id,
        userId: identity.userId,
        displayName: identity.displayName,
      });
      setActiveSession(payload.session);
      setSessions(current => [
        payload.session,
        ...current.filter(item => item.id !== payload.session.id),
      ]);
      return { success: true, data: payload.data };
    } catch (error) {
      setCallError(error.message);
      return { success: false, data: { error: error.message } };
    }
  };
  const finishCall = async () => {
    if (room.ready) {
      try {
        const result = await room.controls.leave();
        if (result?.ok === false) {
          setCallError(result.error || 'The room exit was not confirmed.');
        }
      } catch (error) {
        setCallError(error.message);
      }
    }
    if (activeSession?.id && identity) {
      try {
        const payload = await endSession({
          sessionId: activeSession.id,
          userId: identity.userId,
          reason: 'user_ended',
        });
        setSessions(current => [
          payload.data,
          ...current.filter(item => item.id !== payload.data.id),
        ]);
      } catch (error) {
        setCallError(error.message);
      }
    }
    setCallConfig(null);
    setActiveSession(null);
    setWorkspaceOpen(false);
    roleAssignmentRef.current = null;
    mediaInitializationRef.current = null;
    room.updateSourceParameters({});
  };
  const updateSourceParameters = parameters => {
    const nextParameters = parameters || {};
    // The headless bridge adopts every publication and keeps the seed passed to
    // MediaSFU stable. Its actions read the latest bag at invocation time.
    room.updateSourceParameters(nextParameters);
    const role = callConfig?.mode === 'create' ? '2' : '1';
    if (
      callConfig &&
      roleAssignmentRef.current !== callConfig &&
      typeof nextParameters.updateIslevel === 'function'
    ) {
      nextParameters.updateIslevel(role);
      roleAssignmentRef.current = callConfig;
    }
    if (
      callConfig?.mode === 'create' &&
      nextParameters.validated &&
      mediaInitializationRef.current !== callConfig
    ) {
      mediaInitializationRef.current = callConfig;
      const actions = [];
      if (
        !nextParameters.audioAlreadyOn &&
        typeof nextParameters.clickAudio === 'function'
      ) {
        actions.push(room.controls.toggleMic());
      }
      if (
        callConfig.callType === 'video' &&
        !nextParameters.videoAlreadyOn &&
        typeof nextParameters.clickVideo === 'function'
      ) {
        actions.push(room.controls.toggleCamera());
      }
      Promise.allSettled(actions).catch(() => undefined);
    }
  };
  if (!hydrated)
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color="#237446" />
        <Text style={styles.loadingText}>Loading your calls...</Text>
      </SafeAreaView>
    );
  if (!identity) return <Onboarding onComplete={setIdentity} />;
  if (callConfig)
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar
          barStyle={workspaceOpen ? 'light-content' : 'dark-content'}
        />
        <View style={styles.callRoot}>
          <View
            pointerEvents={workspaceOpen ? 'auto' : 'none'}
            style={
              workspaceOpen ? styles.workspaceEngine : styles.headlessEngine
            }
          >
            <ModernMediasfuGeneric
              returnUI={workspaceOpen}
              sourceParameters={room.sourceParameters}
              updateSourceParameters={updateSourceParameters}
              onMediaChanged={room.onMediaChanged}
              PrejoinPage={PreJoinPage}
              noUIPreJoinOptions={preJoinOptions}
              createMediaSFURoom={createMediaSFURoom}
              joinMediaSFURoom={joinMediaSFURoom}
            />
          </View>
          {workspaceOpen ? (
            <View style={styles.workspaceBar}>
              <Text style={styles.workspaceTitle}>MediaSFU workspace</Text>
              <Text style={styles.workspaceSubtitle}>
                Whiteboard and built-in room tools are available here. Recording
                is disabled for this example.
              </Text>
              <Pressable
                testID="close-workspace"
                onPress={() => setWorkspaceOpen(false)}
                style={styles.workspaceClose}
              >
                <Text style={styles.workspaceCloseText}>Custom controls</Text>
              </Pressable>
            </View>
          ) : (
            <CallInterface
              room={room}
              peerName={
                callConfig.mode === 'join'
                  ? sessionLabel(callConfig.session, identity.userId)
                  : callConfig.targetUserId
              }
              connectionState={
                callError
                  ? 'error'
                  : room.ready
                  ? 'connected'
                  : 'connecting'
              }
              onOpenWorkspace={() => setWorkspaceOpen(true)}
              onEndCall={finishCall}
              onActionError={setCallError}
            />
          )}
          {!!callError && (
            <View style={styles.callError}>
              <Text style={styles.callErrorText}>{callError}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  return (
    <Home
      identity={identity}
      sessions={sessions}
      socketState={socketState}
      incoming={incoming}
      onCreate={startCreate}
      onAccept={acceptIncoming}
      onDecline={declineIncoming}
      onResetIdentity={async () => {
        await AsyncStorage.removeItem('@mediasfu/identity');
        setIdentity(null);
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f8f4' },
  headlessEngine: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
  },
  workspaceEngine: { flex: 1 },
  flex: { flex: 1 },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f8f4',
  },
  loadingText: { color: '#52705d', marginTop: 12 },
  textureOne: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#e4f1e5',
    top: -100,
    right: -90,
    opacity: 0.9,
  },
  textureTwo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#edf6ed',
    bottom: -70,
    left: -70,
  },
  onboarding: {
    padding: 26,
    paddingTop: 54,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#237446',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  brandMarkText: { color: '#fff', fontSize: 25, fontWeight: '900' },
  kicker: {
    color: '#6a8074',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: '#10251c',
    fontSize: 37,
    lineHeight: 42,
    fontWeight: '900',
    marginTop: 10,
    maxWidth: 350,
  },
  heroCopy: {
    color: '#668073',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 15,
    maxWidth: 360,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#e1ece3',
    shadowColor: '#7c9d83',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  formTitle: {
    color: '#173b27',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 18,
  },
  fieldLabel: {
    color: '#6d8374',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#f5f9f5',
    borderWidth: 1,
    borderColor: '#dce9df',
    color: '#183c29',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 12,
  },
  error: { color: '#bd4e49', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#237446',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  buttonArrow: {
    color: '#fff',
    fontSize: 25,
    lineHeight: 25,
    marginLeft: 10,
    marginTop: -2,
  },
  privacy: {
    color: '#819388',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    paddingHorizontal: 20,
  },
  home: { padding: 22, paddingBottom: 40 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  homeTitle: {
    color: '#10251c',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 5,
  },
  identityButton: { alignItems: 'center' },
  identityName: {
    color: '#52705d',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#b7dfbf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLarge: { width: 74, height: 74, borderRadius: 37 },
  avatarText: { color: '#1a623a', fontSize: 15, fontWeight: '900' },
  avatarTextLarge: { fontSize: 24 },
  connectionPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5f2e7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 18,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2da560',
    marginRight: 7,
  },
  connectionDotWarn: { backgroundColor: '#d18b28' },
  connectionText: { color: '#28613d', fontSize: 12, fontWeight: '700' },
  composerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 19,
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#e0ebe2',
    shadowColor: '#7c9d83',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  composerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  composerTitle: { color: '#173b27', fontSize: 20, fontWeight: '900' },
  composerSubtitle: { color: '#769080', fontSize: 12, marginTop: 4 },
  composerIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#e5f2e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dce9df',
    backgroundColor: '#f7faf7',
  },
  typeButtonSelected: { backgroundColor: '#dff1e2', borderColor: '#9bcba4' },
  typeIcon: { color: '#247446', fontSize: 16, marginRight: 7 },
  typeText: { color: '#2d5039', fontSize: 13, fontWeight: '800' },
  incomingCard: {
    backgroundColor: '#235f3a',
    borderRadius: 22,
    padding: 18,
    marginTop: 20,
  },
  incomingTop: { flexDirection: 'row', alignItems: 'center' },
  incomingCopy: { marginLeft: 12, flex: 1 },
  incomingEyebrow: {
    color: '#a9d8b4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  incomingName: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  incomingMeta: { color: '#c5e3ca', fontSize: 12, marginTop: 3 },
  incomingActions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  decline: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#437751',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: '#fff', fontWeight: '800' },
  accept: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#c7edce',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { color: '#1c5a35', fontWeight: '900' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 10,
  },
  sectionTitle: { color: '#173b27', fontSize: 18, fontWeight: '900' },
  chip: {
    backgroundColor: '#e4f1e5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  chipText: { color: '#3d7650', fontSize: 11, fontWeight: '800' },
  sessionsCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e0ebe2',
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eef4ef',
  },
  sessionMain: { flex: 1, marginLeft: 12 },
  sessionName: { color: '#244632', fontSize: 15, fontWeight: '800' },
  sessionMeta: { color: '#7a9080', fontSize: 12, marginTop: 4 },
  sessionChevron: { color: '#83a18d', fontSize: 25, marginLeft: 8 },
  empty: { alignItems: 'center', padding: 28 },
  emptyIcon: { color: '#77a282', fontSize: 34, marginBottom: 8 },
  emptyTitle: { color: '#31543d', fontSize: 15, fontWeight: '800' },
  emptyCopy: {
    color: '#819388',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  historyNote: {
    color: '#85978a',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 16,
    paddingHorizontal: 15,
  },
  callRoot: { flex: 1, backgroundColor: '#f4f8f4' },
  workspaceBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    backgroundColor: 'rgba(13, 34, 23, 0.94)',
    borderRadius: 18,
    padding: 14,
  },
  workspaceTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  workspaceSubtitle: {
    color: '#c5dfca',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  workspaceClose: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#c7edce',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  workspaceCloseText: { color: '#1c5a35', fontSize: 12, fontWeight: '900' },
  callError: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    backgroundColor: '#fff0ed',
    borderColor: '#efc5bc',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  callErrorText: { color: '#a3433d', fontSize: 12, textAlign: 'center' },
});
