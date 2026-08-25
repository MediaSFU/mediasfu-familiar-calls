function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/$/, '');
}

export function createCallApi({ baseUrl, fetchImpl = fetch }) {
  const origin = normalizeBaseUrl(baseUrl);
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${origin}/api${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    return payload;
  };
  return {
    listSessions: userId => request(`/users/${encodeURIComponent(userId)}/sessions`),
    createCall: input => request('/protocol/calls/create', {
      method: 'POST', body: JSON.stringify({ duration: 30, capacity: 2, eventType: 'conference', ...input }),
    }),
    acceptCall: input => request('/protocol/calls/accept', {
      method: 'POST', body: JSON.stringify(input),
    }),
    preparePublisher: input => request('/protocol/prepare', {
      method: 'POST', body: JSON.stringify(input),
    }),
    preparePeer: ({ sessionId, userId }) => request(
      `/protocol/sessions/${encodeURIComponent(sessionId)}/peer?userId=${encodeURIComponent(userId)}`,
    ),
    updatePresentation: ({ sessionId, ...input }) => request(
      `/protocol/sessions/${encodeURIComponent(sessionId)}/presentation`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
    endCall: ({ sessionId, ...input }) => request(`/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  };
}
