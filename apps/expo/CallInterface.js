import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ShellIcon from './ShellIcon';
import { AudioGrid, CardVideoDisplay } from 'mediasfu-reactnative-expo';
import { mediaStateLabels, resolveCallMedia } from './src/mediaPresentation';

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function Action({ icon, label, active, onPress, testID }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.action, active && styles.actionActive]}
    >
      <View style={styles.actionMark}>
        <ShellIcon name={icon} size={19} color="#237446" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const PREVIEW_MARGIN = 14;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampMiniOffset(offset, stage, preview) {
  const baseLeft = Math.max(stage.width - preview.width - PREVIEW_MARGIN, 0);
  const baseTop = PREVIEW_MARGIN;
  return {
    x: clamp(offset.x, -baseLeft, PREVIEW_MARGIN),
    y: clamp(
      offset.y,
      -baseTop,
      Math.max(stage.height - preview.height - baseTop, -baseTop),
    ),
  };
}

function MediaState({ surface, room, compact = false }) {
  const labels = mediaStateLabels(surface, room);
  return (
    <View style={[styles.mediaState, compact && styles.mediaStateCompact]}>
      <Text numberOfLines={1} style={styles.mediaStateName}>
        {surface?.name || 'Call media'}
      </Text>
      <Text style={styles.mediaStateText}>
        {labels.microphone} · {labels.camera}
      </Text>
    </View>
  );
}

function MediaStage({ room, peerName, connectionState }) {
  const media = useMemo(
    () => resolveCallMedia(room, peerName),
    [peerName, room],
  );
  const remoteVideos = media.surfaces.filter(
    surface => surface.kind === 'camera' && !surface.isLocal,
  );
  const remoteVideo = remoteVideos[0] || null;
  const localVideo = media.surfaces.find(
    surface => surface.kind === 'camera' && surface.isLocal,
  );
  const screen = media.surfaces.find(surface => surface.kind === 'screen');
  const canSwapFocus =
    !screen &&
    remoteVideos.length === 1 &&
    Boolean(remoteVideo?.stream && localVideo?.stream);
  const [localFocused, setLocalFocused] = useState(false);
  const lastTapRef = useRef(0);
  const miniOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const miniOffsetRef = useRef({ x: 0, y: 0 });
  const stageBoundsRef = useRef({ width: 0, height: 0 });
  const previewSizeRef = useRef({ width: 0, height: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isMeasured = dimensions.width > 0 && dimensions.height > 0;
  const insetWidth = Math.max(Math.min(dimensions.width * 0.32, 150), 96);
  const insetHeight = Math.max(Math.min(dimensions.height * 0.28, 150), 96);
  const showLocalPrimary = canSwapFocus && localFocused;
  const remoteVideoIdentity =
    remoteVideo?.producerId || remoteVideo?.stream?.id || null;
  const primarySurface = screen
    ? screen
    : showLocalPrimary
    ? localVideo
    : remoteVideo || localVideo || null;
  const previewSurfaces = media.surfaces.filter(
    surface => surface !== primarySurface,
  );
  const previewSurface = previewSurfaces[0] || null;
  const extraSurfaces = previewSurfaces.slice(1);

  useEffect(() => {
    setLocalFocused(false);
    lastTapRef.current = 0;
  }, [canSwapFocus, remoteVideoIdentity, screen]);

  useEffect(() => {
    stageBoundsRef.current = dimensions;
    previewSizeRef.current = { width: insetWidth, height: insetHeight };
    const nextOffset = clampMiniOffset(
      miniOffsetRef.current,
      dimensions,
      previewSizeRef.current,
    );
    miniOffsetRef.current = nextOffset;
    miniOffset.setValue(nextOffset);
  }, [dimensions, insetHeight, insetWidth, miniOffset]);

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300 && canSwapFocus)
      setLocalFocused(value => !value);
    lastTapRef.current = now;
  };
  const handleVideoTapRef = useRef(handleVideoTap);
  handleVideoTapRef.current = handleVideoTap;
  const previewStreamRef = useRef(previewSurface?.stream);
  previewStreamRef.current = previewSurface?.stream;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(previewStreamRef.current),
      onMoveShouldSetPanResponder: () => Boolean(previewStreamRef.current),
      onPanResponderGrant: () => {
        miniOffsetRef.current = { ...miniOffsetRef.current };
      },
      onPanResponderMove: (_, gestureState) => {
        const nextOffset = clampMiniOffset(
          {
            x: miniOffsetRef.current.x + gestureState.dx,
            y: miniOffsetRef.current.y + gestureState.dy,
          },
          stageBoundsRef.current,
          previewSizeRef.current,
        );
        miniOffset.setValue(nextOffset);
      },
      onPanResponderRelease: (_, gestureState) => {
        const nextOffset = clampMiniOffset(
          {
            x: miniOffsetRef.current.x + gestureState.dx,
            y: miniOffsetRef.current.y + gestureState.dy,
          },
          stageBoundsRef.current,
          previewSizeRef.current,
        );
        miniOffsetRef.current = nextOffset;
        miniOffset.setValue(nextOffset);
        if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8)
          handleVideoTapRef.current();
      },
    }),
  ).current;

  return (
    <View
      testID="media-stage"
      onLayout={event => setDimensions(event.nativeEvent.layout)}
      style={styles.mediaStage}
    >
      {isMeasured && primarySurface?.stream ? (
        <Pressable
          testID="main-video"
          accessibilityRole="button"
          accessibilityLabel="Main video. Double-tap to swap video focus."
          onPress={handleVideoTap}
          style={styles.primaryVideoTap}
        >
          <CardVideoDisplay
            remoteProducerId={primarySurface.producerId}
            eventType="conference"
            forceFullDisplay={primarySurface.kind !== 'screen'}
            videoStream={primarySurface.stream}
            doMirror={
              primarySurface.isLocal && primarySurface.kind === 'camera'
            }
            backgroundColor="#10251c"
            style={styles.primaryVideo}
          />
          <MediaState surface={primarySurface} room={room} />
        </Pressable>
      ) : (
        <View style={styles.mediaFallback}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {peerName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.stageTitle}>
            {connectionState === 'connected'
              ? 'Waiting for video'
              : 'Connecting media...'}
          </Text>
          <Text style={styles.stageHint}>
            Turn on video to share your camera, or keep this call audio-only.
          </Text>
        </View>
      )}
      {isMeasured && previewSurface?.stream && (
        <Animated.View
          testID="local-video-preview"
          accessible
          accessibilityRole="button"
          accessibilityLabel="Video preview. Double-tap to swap video focus, or drag to move."
          {...panResponder.panHandlers}
          style={[
            styles.localPreview,
            { width: insetWidth, height: insetHeight },
            { transform: miniOffset.getTranslateTransform() },
          ]}
        >
          <CardVideoDisplay
            remoteProducerId={previewSurface.producerId}
            eventType="conference"
            forceFullDisplay={previewSurface.kind !== 'screen'}
            style={styles.previewVideo}
            videoStream={previewSurface.stream}
            doMirror={
              previewSurface.isLocal && previewSurface.kind === 'camera'
            }
            backgroundColor="#10251c"
          />
          <MediaState surface={previewSurface} room={room} compact />
        </Animated.View>
      )}
      {isMeasured && extraSurfaces.length > 0 && (
        <View testID="remote-video-insets" style={styles.remoteInsets}>
          {extraSurfaces.slice(0, 2).map((item, index) => (
            <View
              key={item.producerId || index}
              style={[
                styles.remoteInset,
                { width: insetWidth, height: insetHeight },
              ]}
            >
              <CardVideoDisplay
                remoteProducerId={item.producerId || 'remote-' + index}
                eventType="conference"
                forceFullDisplay={item.kind !== 'screen'}
                videoStream={item.stream}
                doMirror={item.isLocal && item.kind === 'camera'}
                backgroundColor="#10251c"
              />
              <MediaState surface={item} room={room} compact />
            </View>
          ))}
        </View>
      )}
      {media.audioComponents.length > 0 && (
        <AudioGrid
          componentsToRender={media.audioComponents}
          style={styles.audioMedia}
        />
      )}
    </View>
  );
}
export default function CallInterface({
  room,
  peerName = 'Guest',
  connectionState = 'connected',
  onOpenWorkspace,
  onEndCall,
  onActionError,
}) {
  const [seconds, setSeconds] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const videoOn = Boolean(room?.cameraOn);
  const audioOn = Boolean(room?.micOn);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const invoke = async (action, label) => {
    if (typeof action !== 'function') {
      const message = `${label} is not available until the room is ready.`;
      setActionMessage(message);
      onActionError?.(message);
      return;
    }
    try {
      const result = await action();
      if (result?.ok === false) {
        const message = result.error || `${label} could not be completed.`;
        setActionMessage(message);
        onActionError?.(message);
      } else {
        setActionMessage(`${label} requested.`);
      }
    } catch (_) {
      const message = `${label} could not be completed. Try again.`;
      setActionMessage(message);
      onActionError?.(message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MEDIA CALL</Text>
          <Text style={styles.title}>{peerName}</Text>
        </View>
        <View style={styles.statusWrap}>
          <View
            style={[
              styles.statusDot,
              connectionState !== 'connected' && styles.statusDotWarn,
            ]}
          />
          <Text style={styles.status}>
            {connectionState === 'connected' ? 'Connected' : connectionState}
          </Text>
        </View>
      </View>

      <MediaStage
        room={room}
        peerName={peerName}
        connectionState={connectionState}
      />
      <View style={styles.callSummary}>
        <Text style={styles.timer}>{formatDuration(seconds)}</Text>
        <Text style={styles.callSummaryText}>
          {videoOn ? 'Camera is live' : audioOn ? 'Audio is live' : 'Media off'}
        </Text>
      </View>

      <View style={styles.actionGrid}>
        <Action
          testID="toggle-audio"
          icon={audioOn ? 'microphone' : 'microphone-off'}
          label={audioOn ? 'Mute' : 'Unmute'}
          active={!audioOn}
          onPress={() => invoke(room?.controls?.toggleMic, 'Microphone change')}
        />
        <Action
          testID="toggle-video"
          icon={videoOn ? 'video' : 'video-off'}
          label={videoOn ? 'Video off' : 'Video on'}
          active={videoOn}
          onPress={() => invoke(room?.controls?.toggleCamera, 'Camera change')}
        />
        <Action
          testID="switch-camera"
          icon="camera-switch"
          label="Switch cam"
          onPress={() => invoke(room?.controls?.flipCamera, 'Camera switch')}
        />
        <Action
          testID="open-workspace"
          icon="view-dashboard-outline"
          label="Workspace"
          onPress={onOpenWorkspace}
        />
      </View>

      <Text style={styles.workspaceNote}>
        Whiteboard and other built-in workspace tools open inside MediaSFU.
        Recording is not enabled in this example.
      </Text>
      {!!actionMessage && (
        <Text testID="call-action-status" style={styles.actionStatus}>
          {actionMessage}
        </Text>
      )}
      <Pressable testID="end-call" onPress={onEndCall} style={styles.endButton}>
        <Text style={styles.endButtonText}>End call</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f8f4', padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  eyebrow: {
    color: '#6a8074',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: { color: '#10251c', fontSize: 28, fontWeight: '800', marginTop: 4 },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f2e8',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2da560',
    marginRight: 6,
  },
  statusDotWarn: { backgroundColor: '#d18b28' },
  status: { color: '#28613d', fontSize: 12, fontWeight: '700' },
  mediaStage: {
    flex: 1,
    minHeight: 280,
    marginTop: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#10251c',
  },
  primaryVideo: { flex: 1 },
  primaryVideoTap: { flex: 1 },
  mediaState: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(6, 22, 15, 0.76)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mediaStateCompact: {
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  mediaStateName: { color: '#fff', fontSize: 12, fontWeight: '800' },
  mediaStateText: { color: '#c8efd0', fontSize: 9, marginTop: 2 },
  localPreview: {
    position: 'absolute',
    right: 14,
    top: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#d9f1df',
  },
  previewVideo: { borderRadius: 16, overflow: 'hidden' },
  remoteInsets: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    gap: 8,
  },
  remoteInset: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#d9f1df',
  },
  audioMedia: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#b7dfbf',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 7,
    borderColor: '#e1f2e3',
  },
  avatarText: { color: '#1a623a', fontSize: 35, fontWeight: '800' },
  stageTitle: {
    color: '#effff2',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 20,
  },
  timer: {
    color: '#61806d',
    fontSize: 16,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  callSummary: { alignItems: 'center', paddingVertical: 8 },
  callSummaryText: { color: '#718779', fontSize: 12, marginTop: 2 },
  stageHint: {
    color: '#c8efd0',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 15,
    lineHeight: 19,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  action: {
    minWidth: 92,
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dce9df',
  },
  actionActive: { backgroundColor: '#d9f1df', borderColor: '#93caa1' },
  actionMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eaf4ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  actionLabel: {
    color: '#2b4b37',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  workspaceNote: {
    color: '#718779',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginHorizontal: 8,
    marginBottom: 12,
  },
  actionStatus: {
    color: '#476655',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  endButton: {
    backgroundColor: '#cb4b45',
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 15,
    marginBottom: 4,
  },
  endButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
