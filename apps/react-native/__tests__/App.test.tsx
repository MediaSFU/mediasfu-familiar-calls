/**
 * @format
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import ReactTestRenderer from 'react-test-renderer';

const mockSocketHandlers = {};
const mockCreateSession = jest.fn();
const mockJoinSession = jest.fn();
const mockEndSession = jest.fn();
const mockListSessions = jest.fn();
const mockAudio = jest.fn();
const mockUpdateIslevel = jest.fn();
const renderedApps = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn((event, handler) => {
      mockSocketHandlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

jest.mock('../src/api', () => ({
  createSession: (...args) => mockCreateSession(...args),
  joinSession: (...args) => mockJoinSession(...args),
  endSession: (...args) => mockEndSession(...args),
  listSessions: (...args) => mockListSessions(...args),
}));

jest.mock(
  'mediasfu-reactnative',
  () => {
    const ReactModule = require('react');
    return {
      ModernMediasfuGeneric: 'ModernMediasfuGeneric',
      AudioGrid: 'AudioGrid',
      CardVideoDisplay: 'CardVideoDisplay',
      PreJoinPage: 'PreJoinPage',
      useMediasfuHeadless: () => {
        const seed = ReactModule.useRef({}).current;
        const latest = ReactModule.useRef({});
        const [parameters, setParameters] = ReactModule.useState({});
        const [sourceChanged, setSourceChanged] = ReactModule.useState(0);
        const updateSourceParameters = ReactModule.useCallback(next => {
          latest.current = next || {};
          setParameters(next || {});
          setSourceChanged(value => value + 1);
        }, []);
        const invoke = ReactModule.useCallback(async name => {
          const action = latest.current?.[name];
          if (typeof action !== 'function') {
            return { ok: false, error: `${name} unavailable` };
          }
          await action({ parameters: latest.current });
          return { ok: true, error: '' };
        }, []);
        const controls = ReactModule.useMemo(
          () => ({
            toggleMic: () => invoke('clickAudio'),
            toggleCamera: () => invoke('clickVideo'),
            flipCamera: () => invoke('switchVideoAlt'),
            leave: () => invoke('leave'),
          }),
          [invoke],
        );
        return {
          sourceParameters: seed,
          updateSourceParameters,
          onMediaChanged: data => updateSourceParameters(data?.parameters),
          sourceChanged,
          parameters,
          readiness: {
            ready: Boolean(parameters.validated),
            reason: parameters.validated ? '' : 'Room is connecting',
          },
          ready: Boolean(parameters.validated),
          localVideo: parameters.localStreamVideo || null,
          remoteVideos: [
            ...(parameters.oldAllStreams || []),
            ...(parameters.allVideoStreams || []),
          ],
          screenShare: {
            stream:
              parameters.remoteScreenStream?.[0]?.stream ||
              parameters.remoteScreenStream?.stream ||
              parameters.localStreamScreen ||
              null,
            isLocal: Boolean(parameters.localStreamScreen),
            active: Boolean(
              parameters.remoteScreenStream || parameters.localStreamScreen,
            ),
          },
          audioComponents: [
            ...(parameters.audioOnlyStreams || []),
            ...(parameters.translationStreams || []),
          ],
          participants: parameters.participants || [],
          micOn: Boolean(parameters.audioAlreadyOn),
          cameraOn: Boolean(parameters.videoAlreadyOn),
          controls,
          moderation: { permissions: {} },
          session: {},
          produce: {},
        };
      },
    };
  },
  { virtual: true },
);

jest.mock('../ShellIcon', () => 'ShellIcon');

import App from '../App';
import { clampMiniOffset } from '../CallInterface';
import { resolveCallMedia } from '../src/mediaPresentation';

// The first React Native renderer mount loads platform modules lazily and can
// exceed Jest's browser-oriented five-second default on a cold Windows cache.
jest.setTimeout(60000);

async function renderApp() {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  renderedApps.push(renderer);
  return renderer;
}

function findByTestID(renderer, testID) {
  return renderer.root.findByProps({ testID });
}

beforeEach(() => {
  Object.keys(mockSocketHandlers).forEach(
    key => delete mockSocketHandlers[key],
  );
  mockCreateSession.mockReset();
  mockJoinSession.mockReset();
  mockEndSession.mockReset();
  mockListSessions.mockReset();
  mockUpdateIslevel.mockReset();
  mockListSessions.mockResolvedValue({ success: true, data: [] });
  mockCreateSession.mockResolvedValue({
    success: true,
    data: { meetingID: 'room-123' },
    session: {
      id: 'session-1',
      meetingId: 'room-123',
      hostUserId: 'alex_1',
      targetUserId: 'jamie_2',
      status: 'ringing',
    },
  });
  mockJoinSession.mockResolvedValue({
    success: true,
    data: { meetingID: 'room-123' },
    session: {
      id: 'session-1',
      meetingId: 'room-123',
      hostUserId: 'alex_1',
      targetUserId: 'jamie_2',
      status: 'active',
    },
  });
  mockEndSession.mockResolvedValue({
    success: true,
    data: { id: 'session-1', status: 'ended' },
  });
});

afterEach(async () => {
  const renderers = renderedApps.splice(0);
  await ReactTestRenderer.act(async () => {
    renderers.forEach(renderer => renderer.unmount());
  });
});

test('shows onboarding and rejects an invalid display name', async () => {
  const renderer = await renderApp();
  expect(findByTestID(renderer, 'user-id')).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('alex_1');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Too Long Name');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  expect(
    renderer.root.findByProps({
      children: 'Display name: use 2-10 letters or numbers only.',
    }),
  ).toBeTruthy();
});

test('moves from onboarding to home and starts a headless call', async () => {
  const renderer = await renderApp();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('alex_1');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Alex7');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  expect(renderer.root.findByProps({ children: 'Chats & calls' })).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'target-user').props.onChangeText('jamie_2');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'create-call').props.onPress();
  });
  const engine = renderer.root.findByType('ModernMediasfuGeneric');
  expect(engine.props.returnUI).toBe(false);
  expect(renderer.root.findByProps({ testID: 'media-stage' })).toBeTruthy();
  expect(engine.props.localLink).toBeUndefined();
  expect(engine.props.useSeed).toBeUndefined();
  expect(engine.props.seedData).toBeUndefined();
  await ReactTestRenderer.act(async () => {
    await engine.props.createMediaSFURoom();
  });
  expect(mockCreateSession).toHaveBeenCalledWith(
    expect.objectContaining({ targetUserId: 'jamie_2', displayName: 'Alex7' }),
  );
});

test('renders an incoming call and accepts it', async () => {
  const renderer = await renderApp();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('jamie_2');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Jamie2');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    mockSocketHandlers['call:invite']({
      session: {
        id: 'session-1',
        meetingId: 'room-123',
        hostUserId: 'alex_1',
        targetUserId: 'jamie_2',
        displayName: 'Alex7',
        status: 'ringing',
      },
    });
  });
  expect(findByTestID(renderer, 'incoming-call')).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'accept-call').props.onPress({
      nativeEvent: { pageX: 120, pageY: 240 },
      target: 1,
      type: 'press',
    });
  });
  expect(renderer.root.findByType('ModernMediasfuGeneric')).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    await renderer.root
      .findByType('ModernMediasfuGeneric')
      .props.joinMediaSFURoom();
  });
  expect(mockJoinSession).toHaveBeenCalledWith({
    sessionId: 'session-1',
    userId: 'jamie_2',
    displayName: 'Jamie2',
  });
});

test('wires custom call actions with source parameters', async () => {
  const renderer = await renderApp();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('alex_1');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Alex7');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'target-user').props.onChangeText('jamie_2');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'create-call').props.onPress();
  });
  const engine = renderer.root.findByType('ModernMediasfuGeneric');
  await ReactTestRenderer.act(async () => {
    engine.props.updateSourceParameters({
      clickAudio: mockAudio,
      validated: true,
      audioAlreadyOn: true,
    });
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'toggle-audio').props.onPress();
  });
  expect(mockAudio).toHaveBeenCalledWith({
    parameters: expect.objectContaining({ validated: true }),
  });
});

test('assigns creator level 2 once for the active call config', async () => {
  const renderer = await renderApp();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('alex_1');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Alex7');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'target-user').props.onChangeText('jamie_2');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'create-call').props.onPress();
  });
  const engine = renderer.root.findByType('ModernMediasfuGeneric');
  await ReactTestRenderer.act(async () => {
    engine.props.updateSourceParameters({ updateIslevel: mockUpdateIslevel });
    engine.props.updateSourceParameters({
      updateIslevel: mockUpdateIslevel,
      validated: true,
    });
  });
  expect(mockUpdateIslevel).toHaveBeenCalledTimes(1);
  expect(mockUpdateIslevel).toHaveBeenCalledWith('2');
});

test('assigns joiner level 1 once for the active call config', async () => {
  const renderer = await renderApp();
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'user-id').props.onChangeText('jamie_2');
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'display-name').props.onChangeText('Jamie2');
  });
  await ReactTestRenderer.act(async () => {
    await findByTestID(renderer, 'continue').props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    mockSocketHandlers['call:invite']({
      session: {
        id: 'session-1',
        meetingId: 'room-123',
        hostUserId: 'alex_1',
        targetUserId: 'jamie_2',
        displayName: 'Alex7',
        status: 'ringing',
      },
    });
  });
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'accept-call').props.onPress({
      nativeEvent: { pageX: 120, pageY: 240 },
      target: 1,
      type: 'press',
    });
  });
  const engine = renderer.root.findByType('ModernMediasfuGeneric');
  await ReactTestRenderer.act(async () => {
    engine.props.updateSourceParameters({ updateIslevel: mockUpdateIslevel });
    engine.props.updateSourceParameters({
      updateIslevel: mockUpdateIslevel,
      validated: true,
    });
  });
  expect(mockUpdateIslevel).toHaveBeenCalledTimes(1);
  expect(mockUpdateIslevel).toHaveBeenCalledWith('1');
});

test('uses MaterialCommunityIcons through the ShellIcon wrapper', () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'App.js'),
    'utf8',
  );
  const callSource = fs.readFileSync(
    path.join(__dirname, '..', 'CallInterface.js'),
    'utf8',
  );
  const iconSource = fs.readFileSync(
    path.join(__dirname, '..', 'ShellIcon.js'),
    'utf8',
  );
  expect(appSource).toContain("from './ShellIcon'");
  expect(callSource).toContain("from './ShellIcon'");
  expect(iconSource).toContain(
    "from 'react-native-vector-icons/MaterialCommunityIcons'",
  );
  expect(iconSource).toContain("'help-circle-outline'");
  expect(iconSource).toContain("'camera-switch'");
  expect(iconSource).not.toContain('function Line');
  expect(iconSource).not.toContain('function Camera');
});

test('keeps the headless MediaSFU engine full-size and out of flex flow', () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'App.js'),
    'utf8',
  );
  expect(appSource).toMatch(
    /top: 0[\s\S]*right: 0[\s\S]*bottom: 0[\s\S]*left: 0/,
  );
  expect(appSource).toContain(
    "pointerEvents={workspaceOpen ? 'auto' : 'none'}",
  );
  expect(appSource).toContain(
    'sessionLabel(callConfig.session, identity.userId)',
  );
  expect(appSource).not.toMatch(/headlessEngine: \{[^}]*width: 1/);
});

test('keeps a fallback session label for an unrelated viewer', () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'App.js'),
    'utf8',
  );
  expect(appSource).toContain('return (');
  expect(appSource).toContain('session.displayName ||');
  expect(appSource).toContain('Unknown contact');
});

test('uses actual SDK streams with CardVideoDisplay for the custom media stage', () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'App.js'),
    'utf8',
  );
  const callSource = fs.readFileSync(
    path.join(__dirname, '..', 'CallInterface.js'),
    'utf8',
  );
  const resolverSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'mediaPresentation.js'),
    'utf8',
  );
  expect(callSource).toContain('CardVideoDisplay');
  expect(callSource).toContain('resolveCallMedia');
  expect(appSource).toContain('useMediasfuHeadless');
  expect(appSource).toContain('onMediaChanged={room.onMediaChanged}');
  expect(resolverSource).toContain('room.screenShare?.stream');
  expect(resolverSource).toContain('room.remoteVideos');
  expect(resolverSource).toContain('room.localVideo');
  expect(resolverSource).toContain('room.audioComponents');
  expect(callSource).toContain('clampMiniOffset');
  expect(callSource).toContain('main-video');
  expect(callSource).toContain('local-video-preview');
  expect(callSource).toContain('Double-tap to swap video focus');
  expect(callSource).toContain('PanResponder');
  expect(callSource).toContain('forceFullDisplay');
  expect(callSource).toContain('isMeasured');
  expect(callSource).not.toContain('ModernFlexibleVideo');
  expect(callSource).not.toContain('ModernFlexibleGrid');
});

function videoStream(id, { enabled = true, readyState = 'live' } = {}) {
  const track = { id: `${id}-track`, kind: 'video', enabled, readyState };
  return {
    id,
    getTracks: () => [track],
    toURL: () => `stream:${id}`,
  };
}

test('resolves screen share before remote camera and local camera', () => {
  const screen = videoStream('screen');
  const remote = videoStream('remote');
  const local = videoStream('local');
  const audioA = { key: 'audio-a' };
  const audioB = { key: 'audio-b' };
  const media = resolveCallMedia(
    {
      screenShare: { stream: screen, isLocal: false, active: true },
      remoteVideos: [
        { stream: remote, producerId: 'remote-video', name: 'Jamie' },
      ],
      localVideo: local,
      audioComponents: [audioA, audioB],
      participants: [],
    },
    'Jamie',
  );

  expect(media.primary).toMatchObject({
    kind: 'screen',
    stream: screen,
    isLocal: false,
  });
  expect(media.previews.map(item => item.stream)).toEqual([remote, local]);
  expect(media.audioComponents).toEqual([audioA, audioB]);
});

test('drops dead screen shares without suppressing a remote camera', () => {
  const endedScreen = videoStream('ended-screen', { readyState: 'ended' });
  const remote = videoStream('remote');
  const local = videoStream('local');
  const media = resolveCallMedia({
    screenShare: { stream: endedScreen, isLocal: false, active: true },
    remoteVideos: [{ stream: remote, producerId: 'remote-video' }],
    localVideo: local,
  });

  expect(media.primary.stream).toBe(remote);
  expect(media.primary.kind).toBe('camera');
  expect(media.previews[0].stream).toBe(local);
});

test('does not gate a remote camera on the track muted state', () => {
  const track = {
    id: 'remote-muted-track',
    kind: 'video',
    enabled: true,
    muted: true,
    readyState: 'live',
  };
  const remote = {
    id: 'remote-muted',
    getTracks: () => [track],
    toURL: () => 'stream:remote-muted',
  };
  const media = resolveCallMedia({
    remoteVideos: [{ stream: remote, producerId: 'remote-video' }],
  });

  expect(media.primary.stream).toBe(remote);
});

test('clamps the draggable preview to the measured media stage', () => {
  expect(
    clampMiniOffset(
      { x: -999, y: 999 },
      { width: 320, height: 400 },
      { width: 100, height: 100 },
    ),
  ).toEqual({ x: -206, y: 286 });
});

test('does not expose unsupported mobile screen-share initiation', () => {
  const callSource = fs.readFileSync(
    path.join(__dirname, '..', 'CallInterface.js'),
    'utf8',
  );
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const guide = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'GUIDE.md'),
    'utf8',
  );
  expect(callSource).not.toContain('share-screen');
  expect(callSource).not.toContain('clickScreenShare');
  expect(readme).toContain('cannot initiate screen sharing');
  expect(readme).toContain('receive and display');
  expect(guide).toContain('cannot initiate screen sharing');
  expect(guide).toContain('receive and display');
});
