import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { io as connectSocket } from 'socket.io-client';
import { createRoomProxy, DEFAULT_ROOM_API_URL } from '../src/room-proxy.mjs';
import { MemorySessionStore } from '../src/session-store.mjs';

const servers = [];
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

async function runningServer() {
  const calls = [];
  const server = createRoomProxy({
    store: new MemorySessionStore(),
    env: {
      MEDIASFU_API_USERNAME: 'server-user',
      MEDIASFU_API_KEY: 'server-key',
      MEDIASFU_ROOM_API_URL: 'https://staging.example.test/v1/rooms/',
    },
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body);
      calls.push({ url, options, payload });
      return new Response(`\uFEFF${JSON.stringify({
        roomName: payload.meetingID || 'meeting-123',
        publicURL: 'https://room.example.test',
        secret: 'upstream-only',
      })}`, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, calls, url: `http://127.0.0.1:${server.address().port}` };
}

async function post(url, path, body, headers = {}) {
  return fetch(`${url}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}.`)), 2_000);
    socket.once(name, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

test('production is the default room endpoint', () => {
  assert.equal(DEFAULT_ROOM_API_URL, 'https://mediasfu.com/v1/rooms/');
});

test('implements the contact-call session lifecycle without exposing credentials', async () => {
  const app = await runningServer();
  let response = await post(app.url, '/api/rooms/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser',
    duration: 5, capacity: 2, eventType: 'conference', callType: 'video',
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.success, true);
  assert.equal(created.session.status, 'ringing');
  assert.equal(created.session.callType, 'video');
  assert.equal(created.session.secret, undefined);
  assert.equal(app.calls[0].payload.action, 'create');
  assert.match(app.calls[0].options.headers.authorization, /^Bearer server-user:/);

  response = await fetch(`${app.url}/api/users/guest-1/sessions`);
  const listed = await response.json();
  assert.equal(listed.data.length, 1);
  assert.equal(listed.data[0].id, created.session.id);

  response = await post(app.url, '/api/rooms/join', {
    sessionId: created.session.id, userId: 'intruder', displayName: 'Intruder',
  });
  assert.equal(response.status, 400);

  response = await post(app.url, '/api/rooms/join', {
    sessionId: created.session.id, userId: 'guest-1', displayName: 'GuestUser',
  });
  assert.equal(response.status, 200);
  const joined = await response.json();
  assert.equal(joined.session.status, 'active');
  assert.equal(app.calls[1].payload.action, 'join');
  assert.equal(app.calls[1].payload.meetingID, 'meeting-123');

  response = await post(app.url, `/api/sessions/${created.session.id}/end`, {
    userId: 'host-1', reason: 'user_ended',
  });
  const ended = await response.json();
  assert.equal(ended.data.status, 'ended');
  assert.equal(ended.data.endReason, 'user_ended');
});

test('forwards stable idempotency keys for create and join', async () => {
  const app = await runningServer();
  const created = await (await post(app.url, '/api/rooms/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser',
  }, { 'idempotency-key': 'call-create-0001' })).json();
  await post(app.url, '/api/rooms/join', {
    sessionId: created.session.id, userId: 'guest-1', displayName: 'GuestUser',
  }, { 'idempotency-key': 'call-join-0001' });
  assert.equal(app.calls[0].options.headers['idempotency-key'], 'call-create-0001');
  assert.equal(app.calls[1].options.headers['idempotency-key'], 'call-join-0001');
});

test('uses the protocol requestId as the upstream create idempotency key', async () => {
  const app = await runningServer();
  await post(app.url, '/api/protocol/calls/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser', requestId: 'protocol-create-0001',
  });
  assert.equal(app.calls[0].options.headers['idempotency-key'], 'protocol-create-0001');
});

test('rejects a malformed idempotency key before MediaSFU is called', async () => {
  const app = await runningServer();
  const response = await post(app.url, '/api/rooms/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser',
  }, { 'idempotency-key': 'short' });
  assert.equal(response.status, 400);
  assert.equal(app.calls.length, 0);
});

test('repeated join and end requests are idempotent', async () => {
  const app = await runningServer();
  const created = await (await post(app.url, '/api/rooms/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser',
  })).json();
  const join = () => post(app.url, '/api/rooms/join', {
    sessionId: created.session.id, userId: 'guest-1', displayName: 'GuestUser',
  });
  await join();
  await join();
  assert.equal(app.calls.filter((call) => call.payload.action === 'join').length, 1);

  const end = () => post(app.url, `/api/sessions/${created.session.id}/end`, {
    userId: 'guest-1', reason: 'declined',
  });
  await end();
  const second = await (await end()).json();
  assert.equal(second.data.history.filter((entry) => entry.type === 'ended').length, 1);
});

test('Socket.IO presence receives invite, joined, and ended lifecycle events', async () => {
  const app = await runningServer();
  const socket = connectSocket(app.url, { transports: ['websocket'] });
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect_error', reject);
      socket.once('connect', resolve);
    });
    const registered = await new Promise((resolve) => {
      socket.emit('presence:register', { userId: 'guest-1' }, resolve);
    });
    assert.equal(registered.success, true);

    const invited = event(socket, 'call:invite');
    const created = await (await post(app.url, '/api/rooms/create', {
      hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser', callType: 'audio',
    })).json();
    assert.equal((await invited).session.id, created.session.id);

    const joinedEvent = event(socket, 'call:joined');
    await post(app.url, '/api/rooms/join', {
      sessionId: created.session.id, userId: 'guest-1', displayName: 'GuestUser',
    });
    assert.equal((await joinedEvent).session.status, 'active');

    const endedEvent = event(socket, 'call:ended');
    await post(app.url, `/api/sessions/${created.session.id}/end`, {
      userId: 'host-1', reason: 'user_ended',
    });
    assert.equal((await endedEvent).session.status, 'ended');
  } finally {
    socket.disconnect();
  }
});

test('invalid input is rejected before any upstream request', async () => {
  const app = await runningServer();
  const response = await post(app.url, '/api/rooms/create', {
    hostUserId: 'same-user', targetUserId: 'same-user', displayName: 'bad name',
  });
  assert.equal(response.status, 400);
  assert.equal(app.calls.length, 0);
});

test('unconfigured backend reports readiness but refuses room creation', async () => {
  const server = createRoomProxy({
    env: {}, store: new MemorySessionStore(), fetchImpl: async () => { throw new Error('must not call'); },
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${url}/health`)).json();
  assert.equal(health.data.configured, false);
  const response = await post(url, '/api/rooms/create', {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser',
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, error: 'The local call backend is not configured.' });
});

test('brokers a two-person WHIP publish and WHEP consume call without an SDK', async () => {
  const calls = [];
  let publisherIndex = 0;
  let playbackIndex = 0;
  const publisherIds = [
    'ems_111111111111111111111111',
    'ems_222222222222222222222222',
  ];
  const server = createRoomProxy({
    store: new MemorySessionStore(),
    env: {
      MEDIASFU_API_USERNAME: 'server-user',
      MEDIASFU_API_KEY: 'server-key',
      MEDIASFU_ROOM_API_URL: 'https://staging.example.test/v1/rooms/',
    },
    fetchImpl: async (url, options) => {
      const payload = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method: options.method, payload, headers: options.headers });
      if (url.endsWith('/v1/rooms/')) {
        if (payload.action === 'delete') return Response.json({ success: true });
        return Response.json({
          success: true,
          roomName: 'smeeting123',
          secret: 'room-only',
          link: 'https://sp-stage.example.test',
        });
      }
      if (options.method === 'POST' && url.endsWith('/external-sessions')) {
        const sessionID = publisherIds[publisherIndex++];
        return Response.json({
          success: true,
          sessionID,
          ingest: {
            url: `https://sp-stage.example.test/whip/smeeting123/${sessionID}`,
            token: `whip-token-${sessionID}`,
          },
        }, { status: 201 });
      }
      if (options.method === 'GET' && url.includes('/external-sessions/')) {
        return Response.json({
          success: true,
          state: 'active',
          tracks: [
            { kind: 'audio', state: 'active' },
            { kind: 'video', state: 'active' },
          ],
        });
      }
      if (options.method === 'POST' && url.endsWith('/playbacks')) {
        playbackIndex += 1;
        const playbackID = `emp_${String(playbackIndex).repeat(24)}`;
        return Response.json({
          success: true,
          playbackID,
          endpointUrl: `https://sc-stage.example.test/whep/smeeting123/${playbackID}`,
          playbackToken: `whep-token-${playbackID}`,
        }, { status: 201 });
      }
      if (options.method === 'DELETE') return Response.json({ success: true });
      throw new Error(`Unexpected request: ${options.method} ${url}`);
    },
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  const createInput = {
    hostUserId: 'host-1', targetUserId: 'guest-1', displayName: 'HostUser', callType: 'video',
    requestId: 'native-call-request-1',
  };
  const createResponses = await Promise.all([
    post(url, '/api/protocol/calls/create', createInput),
    post(url, '/api/protocol/calls/create', createInput),
  ]);
  const createdPayloads = await Promise.all(createResponses.map((item) => item.json()));
  const created = createdPayloads[0];
  assert.deepEqual(createResponses.map((item) => item.status).sort(), [200, 201]);
  assert.equal(createdPayloads[0].session.id, createdPayloads[1].session.id);
  const sessionId = created.session.id;
  assert.equal(created.data, undefined);
  assert.equal(calls.filter((call) => call.payload?.action === 'create').length, 1);
  assert.equal(calls.find((call) => call.payload?.action === 'create').payload.capacity, 2);
  let response = await post(url, '/api/protocol/prepare', {
    sessionId, userId: 'host-1', displayName: 'HostUser',
  });
  assert.equal(response.status, 200);
  const host = await response.json();
  assert.match(host.data.publisher.url, /^https:\/\/sp-stage\.example\.test\/whip\//);
  assert.equal(host.data.publisher.token.startsWith('whip-token-'), true);
  assert.equal(calls.find((call) => call.method === 'POST' && call.url.endsWith('/external-sessions')).payload.role, 'host');

  response = await post(url, '/api/protocol/calls/accept', {
    sessionId, userId: 'guest-1', displayName: 'GuestUser',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, 'active');
  assert.equal(calls.filter((call) => call.payload?.action === 'join').length, 0);

  await post(url, '/api/protocol/prepare', {
    sessionId, userId: 'guest-1', displayName: 'GuestUser',
  });
  response = await post(url, `/api/protocol/sessions/${sessionId}/presentation`, {
    userId: 'guest-1', screenActive: true,
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { screenActive: true });
  response = await fetch(`${url}/api/protocol/sessions/${sessionId}/peer?userId=host-1`);
  assert.equal(response.status, 200);
  const peer = await response.json();
  assert.equal(peer.data.ready, true);
  assert.match(peer.data.playback.url, /^https:\/\/sc-stage\.example\.test\/whep\//);
  assert.equal(peer.data.playback.token.startsWith('whep-token-'), true);
  assert.deepEqual(peer.data.peerPresentation, { screenActive: true });

  response = await post(url, `/api/protocol/sessions/${sessionId}/presentation`, {
    userId: 'guest-1', screenActive: false,
  });
  assert.equal(response.status, 200);
  const refreshedPeer = await (await fetch(
    `${url}/api/protocol/sessions/${sessionId}/peer?userId=host-1`,
  )).json();
  assert.deepEqual(refreshedPeer.data.peerPresentation, { screenActive: false });
  assert.equal(calls.filter((call) => call.method === 'POST' && call.url.endsWith('/playbacks')).length, 1);

  response = await post(url, `/api/protocol/sessions/${sessionId}/presentation`, {
    userId: 'intruder', screenActive: true,
  });
  assert.equal(response.status, 400);
  response = await post(url, `/api/protocol/sessions/${sessionId}/presentation`, {
    userId: 'host-1', screenActive: 'yes',
  });
  assert.equal(response.status, 400);
  assert.equal(calls.filter((call) => call.url.includes('/v1/meetings/')).every(
    (call) => call.headers.authorization === 'Bearer server-user:server-key'
  ), true);

  response = await post(url, `/api/sessions/${sessionId}/end`, {
    userId: 'host-1', reason: 'user_ended',
  });
  assert.equal(response.status, 200);
  assert.equal(calls.some((call) => call.method === 'DELETE' && call.url.includes('/playbacks/')), true);
  assert.equal(calls.filter((call) => call.method === 'DELETE' && call.url.includes('/external-sessions/')).length, 2);
  assert.equal(calls.some((call) => call.payload?.action === 'delete'), true);

  response = await post(url, `/api/protocol/sessions/${sessionId}/presentation`, {
    userId: 'guest-1', screenActive: true,
  });
  assert.equal(response.status, 409);
});
