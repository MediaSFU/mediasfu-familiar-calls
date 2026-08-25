import { API_BASE_URL } from './config';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function listSessions(userId) {
  return request(`/users/${encodeURIComponent(userId)}/sessions`);
}

export function createSession({ hostUserId, targetUserId, displayName, duration = 30, capacity = 2 }) {
  return request('/rooms/create', {
    method: 'POST',
    body: JSON.stringify({ hostUserId, targetUserId, displayName, duration, capacity, eventType: 'conference' }),
  });
}

export function joinSession({ sessionId, userId, displayName }) {
  return request('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ sessionId, userId, displayName }),
  });
}

export function endSession({ sessionId, userId, reason = 'user_ended' }) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  });
}
