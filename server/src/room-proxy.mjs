import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';
import { createExternalMediaBroker } from './external-media-broker.mjs';
import { JsonSessionStore } from './session-store.mjs';

export const DEFAULT_ROOM_API_URL = 'https://mediasfu.com/v1/rooms/';

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9]{2,10}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{8,128}$/;

function apiError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function roomIdempotencyKey(request) {
  const value = request.headers['idempotency-key'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw apiError('Idempotency-Key must be 8-128 visible ASCII characters.');
  }
  return value;
}

function validateUserId(value, field = 'userId') {
  const result = text(value);
  if (!USER_ID_PATTERN.test(result)) {
    throw apiError(`${field} must be 2-64 letters, numbers, underscores, or hyphens.`);
  }
  return result;
}

function validateDisplayName(value) {
  const result = text(value);
  if (!DISPLAY_NAME_PATTERN.test(result)) {
    throw apiError('displayName must be alphanumeric and 2-10 characters.');
  }
  return result;
}

function positiveInteger(value, field, maximum) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw apiError(`${field} must be an integer between 1 and ${maximum}.`);
  }
  return result;
}

function validateEventType(value) {
  const result = text(value || 'conference').toLowerCase();
  if (!['chat', 'broadcast', 'webinar', 'conference'].includes(result)) {
    throw apiError('eventType must be chat, broadcast, webinar, or conference.');
  }
  return result;
}

function roomIdFromData(data) {
  return data?.meetingID || data?.meetingId || data?.roomName || data?.roomId || null;
}

function sanitizedHistory(history = []) {
  return history.map(({ type, at, userId, reason }) => ({ type, at, userId, reason }));
}

function sanitizeSession(session) {
  return {
    id: session.id,
    hostUserId: session.hostUserId,
    targetUserId: session.targetUserId,
    displayName: session.displayName,
    meetingId: session.meetingId,
    callType: session.callType,
    status: session.status,
    duration: session.duration,
    capacity: session.capacity,
    eventType: session.eventType,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    endedDurationSeconds: session.endedDurationSeconds,
    history: sanitizedHistory(session.history),
  };
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 32_768) throw apiError('Request is too large.', 413);
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw apiError('Request body must be valid JSON.');
  }
}

function now() {
  return new Date().toISOString();
}

/**
 * Framework-neutral sample call backend. Persistence is intentionally in-memory;
 * production deployments must replace identity, authorization, and storage.
 */
export function createRoomProxy({ env = process.env, fetchImpl = fetch, store } = {}) {
  const apiUserName = env.MEDIASFU_API_USERNAME;
  const apiKey = env.MEDIASFU_API_KEY;
  const roomApiUrl = env.MEDIASFU_ROOM_API_URL || DEFAULT_ROOM_API_URL;
  const corsOrigin = env.CORS_ORIGIN || '*';
  const defaultStorePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'sessions.json',
  );
  const sessionStore = store || new JsonSessionStore(env.MEDIASFU_SESSION_STORE_PATH || defaultStorePath);
  const protocolCreateRequests = new Map();
  const roomJoinHandoffs = new Map();
  const protocolBroker = createExternalMediaBroker({
    env,
    fetchImpl,
    getSession: async (sessionId) => {
      const state = await sessionStore.read();
      return state.sessions.find((session) => session.id === sessionId) || null;
    },
  });

  const json = (response, status, body) => {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-headers': 'content-type,idempotency-key',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  };

  const callMediaSFU = async (payload, idempotencyKey) => {
    if (!apiUserName || !apiKey) {
      throw apiError('The local call backend is not configured.', 503);
    }
    const upstream = await fetchImpl(roomApiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiUserName}:${apiKey}`,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    let data;
    try {
      const raw = await upstream.text();
      data = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
    } catch {
      data = { error: 'MediaSFU returned an invalid response.' };
    }
    if (!upstream.ok) {
      if (env.MEDIASFU_VALIDATION_DIAGNOSTICS === '1') {
        console.warn(`MediaSFU room request failed with upstream status ${upstream.status}.`);
      }
      throw apiError(
        data?.error || 'MediaSFU room request failed.',
        upstream.status >= 400 && upstream.status < 500 ? 400 : 502,
      );
    }
    return data;
  };

  let io;
  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return json(response, 204, {});
    const url = new URL(request.url || '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, {
          success: true,
          data: { status: 'ok', service: 'mediasfu-familiar-call-server', configured: Boolean(apiUserName && apiKey) },
        });
      }

      const userSessionsMatch = request.method === 'GET'
        && url.pathname.match(/^\/api\/users\/([^/]+)\/sessions$/);
      if (userSessionsMatch) {
        const userId = validateUserId(decodeURIComponent(userSessionsMatch[1]));
        const state = await sessionStore.read();
        const data = state.sessions
          .filter((session) => session.hostUserId === userId || session.targetUserId === userId)
          .map(sanitizeSession);
        return json(response, 200, { success: true, data });
      }

      const sessionMatch = request.method === 'GET'
        && url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const state = await sessionStore.read();
        const session = state.sessions.find((item) => item.id === decodeURIComponent(sessionMatch[1]));
        if (!session) return json(response, 404, { success: false, error: 'Session not found.' });
        return json(response, 200, { success: true, data: sanitizeSession(session) });
      }

      if (request.method === 'POST' && url.pathname === '/api/rooms/create') {
        const input = await readBody(request);
        const hostUserId = validateUserId(input.hostUserId, 'hostUserId');
        const targetUserId = validateUserId(input.targetUserId, 'targetUserId');
        if (hostUserId === targetUserId) throw apiError('Choose a different person to call.');
        const displayName = validateDisplayName(input.displayName);
        const duration = positiveInteger(input.duration ?? 30, 'duration', 24 * 60);
        const capacity = positiveInteger(input.capacity ?? 2, 'capacity', 10_000);
        const eventType = validateEventType(input.eventType);
        const callType = input.callType === 'audio' ? 'audio' : 'video';

        const result = await sessionStore.update(async (state) => {
          const data = await callMediaSFU({
            action: 'create', userName: displayName, duration, capacity, eventType, recordOnly: false,
          }, roomIdempotencyKey(request));
          const meetingId = roomIdFromData(data);
          if (!meetingId) throw new Error('MediaSFU create response did not include a meeting identifier.');
          const createdAt = now();
          const session = {
            id: crypto.randomUUID(), hostUserId, targetUserId, displayName,
            meetingId: String(meetingId), callType, status: 'ringing', duration,
            capacity, eventType, createdAt, updatedAt: createdAt, endedAt: null,
            endReason: null, endedDurationSeconds: null, joinedUserIds: [],
            history: [{ type: 'created', at: createdAt, userId: hostUserId }],
          };
          state.sessions.push(session);
          return { data, session };
        });
        io.to(`user:${targetUserId}`).emit('call:invite', { session: sanitizeSession(result.session) });
        return json(response, 201, {
          success: true, data: result.data, session: sanitizeSession(result.session),
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/protocol/calls/create') {
        const input = await readBody(request);
        const hostUserId = validateUserId(input.hostUserId, 'hostUserId');
        const targetUserId = validateUserId(input.targetUserId, 'targetUserId');
        if (hostUserId === targetUserId) throw apiError('Choose a different person to call.');
        const displayName = validateDisplayName(input.displayName);
        const duration = positiveInteger(input.duration ?? 30, 'duration', 24 * 60);
        const capacity = positiveInteger(input.capacity ?? 2, 'capacity', 10_000);
        const eventType = validateEventType(input.eventType);
        const callType = input.callType === 'audio' ? 'audio' : 'video';
        const requestId = text(input.requestId);
        if (requestId && !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
          throw apiError('requestId must be an opaque 8-128 character identifier.');
        }
        if (requestId) {
          const state = await sessionStore.read();
          const existing = state.sessions.find((item) => (
            item.clientRequestId === requestId && item.hostUserId === hostUserId
          ));
          if (existing) {
            return json(response, 200, { success: true, session: sanitizeSession(existing) });
          }
          const inFlight = protocolCreateRequests.get(`${hostUserId}:${requestId}`);
          if (inFlight) {
            const created = await inFlight;
            if (!created) throw apiError('The original call creation request failed.', 502);
            return json(response, 200, { success: true, session: sanitizeSession(created) });
          }
        }
        const requestKey = requestId ? `${hostUserId}:${requestId}` : '';
        let settleCreateRequest = () => {};
        if (requestKey) {
          protocolCreateRequests.set(requestKey, new Promise((resolve) => {
            settleCreateRequest = resolve;
          }));
        }
        const sessionId = crypto.randomUUID();
        let data;

        try {
          data = await callMediaSFU({
            action: 'create', userName: displayName, duration,
            capacity, eventType, recordOnly: false,
          }, requestId || roomIdempotencyKey(request));
          const meetingId = roomIdFromData(data);
          if (!meetingId) throw new Error('MediaSFU create response did not include a meeting identifier.');

          const createdAt = now();
          const session = {
            id: sessionId, hostUserId, targetUserId, displayName,
            clientRequestId: requestId || null,
            meetingId: String(meetingId), callType, status: 'ringing', duration,
            capacity, eventType, createdAt, updatedAt: createdAt, endedAt: null,
            endReason: null, endedDurationSeconds: null, joinedUserIds: [],
            history: [{ type: 'created', at: createdAt, userId: hostUserId }],
          };
          await sessionStore.update(async (state) => {
            state.sessions.push(session);
          });
          settleCreateRequest(session);
          io.to(`user:${targetUserId}`).emit('call:invite', { session: sanitizeSession(session) });
          return json(response, 201, { success: true, session: sanitizeSession(session) });
        } catch (error) {
          settleCreateRequest(null);
          if (env.MEDIASFU_VALIDATION_DIAGNOSTICS === '1') {
            console.warn(`Protocol call creation failed: ${error.message}`);
          }
          const meetingId = roomIdFromData(data);
          if (meetingId) {
            try { await callMediaSFU({ action: 'delete', meetingID: meetingId }); } catch { /* best-effort rollback */ }
          }
          throw error;
        } finally {
          if (requestKey) protocolCreateRequests.delete(requestKey);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/rooms/join') {
        const input = await readBody(request);
        const sessionId = text(input.sessionId);
        if (!sessionId) throw apiError('sessionId is required.');
        const userId = validateUserId(input.userId);
        const displayName = validateDisplayName(input.displayName);
        let joinedNow = false;
        const result = await sessionStore.update(async (state) => {
          const session = state.sessions.find((item) => item.id === sessionId);
          if (!session) return null;
          if (![session.hostUserId, session.targetUserId].includes(userId)) {
            throw apiError('This user is not a participant in the session.');
          }
          if (session.status === 'ended') throw apiError('This call has ended.');
          const handoffKey = `${session.id}:${userId}`;
          const existingHandoff = roomJoinHandoffs.get(handoffKey);
          if (session.joinedUserIds.includes(userId) && existingHandoff) {
            return { data: existingHandoff, session };
          }
          const data = await callMediaSFU({
            action: 'join', meetingID: session.meetingId, userName: displayName,
          }, roomIdempotencyKey(request));
          roomJoinHandoffs.set(handoffKey, data);
          if (!session.joinedUserIds.includes(userId)) {
            session.joinedUserIds.push(userId);
            session.status = 'active';
            session.updatedAt = now();
            session.history.push({ type: 'joined', at: session.updatedAt, userId });
            joinedNow = true;
          }
          return { data, session };
        });
        if (!result) return json(response, 404, { success: false, error: 'Session not found.' });
        if (joinedNow) {
          const event = { session: sanitizeSession(result.session), userId };
          io.to(`user:${result.session.hostUserId}`).emit('call:joined', event);
          io.to(`user:${result.session.targetUserId}`).emit('call:joined', event);
        }
        return json(response, 200, {
          success: true, data: result.data, session: sanitizeSession(result.session),
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/protocol/calls/accept') {
        const input = await readBody(request);
        const sessionId = text(input.sessionId);
        if (!sessionId) throw apiError('sessionId is required.');
        const userId = validateUserId(input.userId);
        let joinedNow = false;
        const result = await sessionStore.update(async (state) => {
          const session = state.sessions.find((item) => item.id === sessionId);
          if (!session) return null;
          if (![session.hostUserId, session.targetUserId].includes(userId)) {
            throw apiError('This user is not a participant in the session.');
          }
          if (session.status === 'ended') throw apiError('This call has ended.');
          if (!session.joinedUserIds.includes(userId)) {
            session.joinedUserIds.push(userId);
            session.status = 'active';
            session.updatedAt = now();
            session.history.push({ type: 'joined', at: session.updatedAt, userId });
            joinedNow = true;
          }
          return session;
        });
        if (!result) return json(response, 404, { success: false, error: 'Session not found.' });
        if (joinedNow) {
          const event = { session: sanitizeSession(result), userId };
          io.to(`user:${result.hostUserId}`).emit('call:joined', event);
          io.to(`user:${result.targetUserId}`).emit('call:joined', event);
        }
        return json(response, 200, { success: true, data: sanitizeSession(result) });
      }

      if (request.method === 'POST' && url.pathname === '/api/protocol/prepare') {
        const input = await readBody(request);
        const data = await protocolBroker.preparePublisher({
          sessionId: input.sessionId,
          userId: input.userId,
          displayName: input.displayName,
        });
        return json(response, 200, { success: true, data });
      }

      const peerProtocolMatch = request.method === 'GET'
        && url.pathname.match(/^\/api\/protocol\/sessions\/([^/]+)\/peer$/);
      if (peerProtocolMatch) {
        const data = await protocolBroker.preparePeerPlayback({
          sessionId: decodeURIComponent(peerProtocolMatch[1]),
          userId: url.searchParams.get('userId'),
        });
        return json(response, data.ready ? 200 : 202, { success: true, data });
      }

      const presentationMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/protocol\/sessions\/([^/]+)\/presentation$/);
      if (presentationMatch) {
        const input = await readBody(request);
        const data = await protocolBroker.updatePresentation({
          sessionId: decodeURIComponent(presentationMatch[1]),
          userId: input.userId,
          screenActive: input.screenActive,
        });
        return json(response, 200, { success: true, data });
      }

      const endMatch = request.method === 'POST'
        && url.pathname.match(/^\/api\/sessions\/([^/]+)\/end$/);
      if (endMatch) {
        const input = await readBody(request);
        const sessionId = decodeURIComponent(endMatch[1]);
        const userId = validateUserId(input.userId);
        let endedNow = false;
        const result = await sessionStore.update(async (state) => {
          const session = state.sessions.find((item) => item.id === sessionId);
          if (!session) return null;
          if (![session.hostUserId, session.targetUserId].includes(userId)) {
            throw apiError('This user is not a participant in the session.');
          }
          if (session.status === 'ended') return session;
          session.status = 'ended';
          session.endedAt = now();
          session.updatedAt = session.endedAt;
          session.endReason = text(input.reason || 'user_ended').slice(0, 100);
          session.endedDurationSeconds = Math.max(
            0,
            Math.floor((Date.parse(session.endedAt) - Date.parse(session.createdAt)) / 1000),
          );
          session.history.push({
            type: 'ended', at: session.endedAt, userId, reason: session.endReason,
          });
          endedNow = true;
          return session;
        });
        if (!result) return json(response, 404, { success: false, error: 'Session not found.' });
        const hadProtocolCall = protocolBroker.hasCall(sessionId);
        if (hadProtocolCall) {
          await protocolBroker.cleanupCall(sessionId, result.endReason || 'call_ended');
        }
        if (hadProtocolCall) {
          try {
            await callMediaSFU({ action: 'delete', meetingID: result.meetingId });
          } catch {
            // The protocol resources are already closed. A room that expired or
            // was independently ended is safe to treat as cleaned up here.
          }
        }
        if (endedNow) {
          for (const key of roomJoinHandoffs.keys()) {
            if (key.startsWith(`${sessionId}:`)) roomJoinHandoffs.delete(key);
          }
          const event = { session: sanitizeSession(result), userId, reason: result.endReason };
          io.to(`user:${result.hostUserId}`).emit('call:ended', event);
          io.to(`user:${result.targetUserId}`).emit('call:ended', event);
        }
        return json(response, 200, { success: true, data: sanitizeSession(result) });
      }

      return json(response, 404, { success: false, error: 'Not found.' });
    } catch (error) {
      const status = error.statusCode || 500;
      return json(response, status, {
        success: false,
        error: status >= 500 && status !== 503
          ? 'The server could not complete the request.'
          : error.message,
      });
    }
  });

  io = new SocketServer(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });
  io.on('connection', (socket) => {
    socket.on('presence:register', (payload, acknowledge) => {
      try {
        const userId = validateUserId(payload?.userId);
        if (socket.data.userId) socket.leave(`user:${socket.data.userId}`);
        socket.data.userId = userId;
        socket.join(`user:${userId}`);
        if (typeof acknowledge === 'function') acknowledge({ success: true, data: { userId } });
      } catch (error) {
        if (typeof acknowledge === 'function') acknowledge({ success: false, error: error.message });
      }
    });
    socket.on('session:sync', async (payload, acknowledge) => {
      try {
        const userId = validateUserId(payload?.userId || socket.data.userId);
        const state = await sessionStore.read();
        const data = state.sessions
          .filter((session) => session.hostUserId === userId || session.targetUserId === userId)
          .map(sanitizeSession);
        if (typeof acknowledge === 'function') acknowledge({ success: true, data: { sessions: data } });
      } catch (error) {
        if (typeof acknowledge === 'function') acknowledge({ success: false, error: error.message });
      }
    });
  });

  return server;
}

export const validation = { sanitizeSession, validateDisplayName, validateUserId };
