export const WHEP_PROFILE_HEADER = 'x-mediasfu-rtp-payload-types';

export function parsePayloadProfile(value) {
  const profile = new Map();
  for (const entry of String(value || '').split(',')) {
    const [mimeType, rawPayloadType] = entry.trim().split('=');
    const payloadType = Number(rawPayloadType);
    if (mimeType && Number.isInteger(payloadType)) {
      profile.set(mimeType.toLowerCase(), payloadType);
    }
  }
  return profile;
}

function codecPayloads(section, mimeType) {
  const codec = mimeType.toLowerCase().split('/')[1];
  return [...section.matchAll(/^a=rtpmap:(\d+)\s+([^/\s]+)\/\d+(?:\/\d+)?\s*$/gim)]
    .filter(match => match[2].toLowerCase() === codec)
    .map(match => Number(match[1]));
}

function chooseCodecPayload(section, mimeType) {
  const payloads = codecPayloads(section, mimeType);
  if (mimeType !== 'video/h264') return payloads[0] ?? null;
  const packetized = payloads.filter(payloadType => {
    const fmtp = new RegExp(`^a=fmtp:${payloadType}\\s+([^\\r\\n]+)$`, 'im').exec(section)?.[1] || '';
    return /(?:^|;)packetization-mode=1(?:;|$)/i.test(fmtp);
  });
  return packetized.find(payloadType => {
    const fmtp = new RegExp(`^a=fmtp:${payloadType}\\s+([^\\r\\n]+)$`, 'im').exec(section)?.[1] || '';
    return /profile-level-id=42e/i.test(fmtp);
  }) ?? packetized[0] ?? payloads[0] ?? null;
}

function remapPayloadType(section, mimeType, targetPayloadType) {
  const assigned = new RegExp(`^a=rtpmap:${targetPayloadType}\\s+([^/\\s]+)\\/`, 'im')
    .exec(section)?.[1]?.toLowerCase();
  const codec = mimeType.split('/')[1];
  if (assigned === codec) return section;
  if (assigned) throw new Error(`WHEP payload type ${targetPayloadType} is already assigned to ${assigned}.`);
  const sourcePayloadType = chooseCodecPayload(section, mimeType);
  if (sourcePayloadType === null || sourcePayloadType === targetPayloadType) return section;
  const mLine = /^m=([^\r\n]+)$/im.exec(section)?.[0];
  if (!mLine) return section;
  const fields = mLine.split(/\s+/);
  const index = fields.indexOf(String(sourcePayloadType));
  if (index < 0) return section;
  fields[index] = String(targetPayloadType);
  section = section.replace(mLine, fields.join(' '));
  section = section.replace(
    new RegExp(`^(a=(?:rtpmap|fmtp|rtcp-fb):)${sourcePayloadType}(?=[ \\r]|$)`, 'gim'),
    `$1${targetPayloadType}`,
  );
  return section.replace(
    new RegExp(`(\\bapt=)${sourcePayloadType}(?=;|\\s|$)`, 'gim'),
    `$1${targetPayloadType}`,
  );
}

export function alignOfferToPayloadProfile(sdp, profile) {
  if (!(profile instanceof Map) || !profile.size) {
    throw new Error('The WHEP endpoint omitted its RTP payload profile.');
  }
  const supported = new Set([
    'audio/opus', 'audio/pcmu', 'audio/pcma', 'video/vp8', 'video/vp9', 'video/h264',
  ]);
  return String(sdp).split(/(?=m=)/).map(section => {
    const kind = /^m=(audio|video)\s/im.exec(section)?.[1]?.toLowerCase();
    if (!kind) return section;
    for (const [mimeType, payloadType] of profile) {
      if (supported.has(mimeType) && mimeType.startsWith(`${kind}/`)) {
        section = remapPayloadType(section, mimeType, payloadType);
      }
    }
    return section;
  }).join('');
}

export function waitForIceGathering(peer, timeoutMs = 12000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const previous = peer.onicegatheringstatechange;
    const timer = setTimeout(() => {
      peer.onicegatheringstatechange = previous || null;
      reject(new Error('WebRTC ICE gathering timed out.'));
    }, timeoutMs);
    peer.onicegatheringstatechange = event => {
      previous?.(event);
      if (peer.iceGatheringState !== 'complete') return;
      clearTimeout(timer);
      peer.onicegatheringstatechange = previous || null;
      resolve();
    };
  });
}

function resolveResourceUrl(location, endpoint) {
  try { return new URL(location, endpoint).toString(); } catch {
    if (/^https?:\/\//i.test(location)) return location;
    const origin = String(endpoint).match(/^(https?:\/\/[^/]+)/i)?.[1] || '';
    return `${origin}${location.startsWith('/') ? '' : '/'}${location}`;
  }
}

async function stopResource(resourceUrl, token, fetchImpl) {
  if (!resourceUrl) return;
  try {
    await fetchImpl(resourceUrl, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  } catch { /* backend cleanup remains the final safety net */ }
}

async function protocolFailure(protocol, response, body) {
  let detail = '';
  try {
    const payload = JSON.parse(String(body || ''));
    const code = String(payload.code || '').replace(/[^A-Z0-9_]/gi, '').slice(0, 64);
    const message = String(payload.error || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
    detail = [code, message].filter(Boolean).join(': ');
  } catch { /* non-JSON SDP endpoint failure */ }
  return new Error(`${protocol} was refused (${response.status})${detail ? ` · ${detail}` : ''}.`);
}

export async function publishWhip({ url, token, stream, fetchImpl, PeerConnection }) {
  if (!stream?.getTracks?.().length) throw new Error('A captured audio/video stream is required.');
  const peer = new PeerConnection({ bundlePolicy: 'max-bundle' });
  stream.getTracks().forEach(track => peer.addTrack(track, stream));
  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/sdp' },
      body: peer.localDescription.sdp,
    });
    const answer = await response.text();
    if (response.status !== 201) throw await protocolFailure('WHIP publish', response, answer);
    const location = response.headers.get('location');
    if (!location) throw new Error('WHIP publish response omitted its resource URL.');
    const resourceUrl = resolveResourceUrl(location, url);
    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    return {
      peer,
      resourceUrl,
      stop: async () => {
        await stopResource(resourceUrl, token, fetchImpl);
        try { peer.close(); } catch { /* already closed */ }
      },
    };
  } catch (error) {
    peer.close();
    throw error;
  }
}

export async function consumeWhep({
  url, token, tracks, fetchImpl, PeerConnection, Stream,
}) {
  const peer = new PeerConnection({ bundlePolicy: 'max-bundle' });
  const stream = new Stream();
  for (const kind of tracks) peer.addTransceiver(kind, { direction: 'recvonly' });
  peer.ontrack = event => {
    if (event.track && !stream.getTracks().includes(event.track)) stream.addTrack(event.track);
  };
  try {
    const profileResponse = await fetchImpl(url, { method: 'GET' });
    if (!profileResponse.ok) throw new Error(`WHEP profile request failed (${profileResponse.status}).`);
    const profile = parsePayloadProfile(profileResponse.headers.get(WHEP_PROFILE_HEADER));
    const offer = await peer.createOffer();
    const aligned = alignOfferToPayloadProfile(offer.sdp, profile);
    await peer.setLocalDescription({ type: 'offer', sdp: aligned });
    await waitForIceGathering(peer);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/sdp' },
      body: peer.localDescription.sdp,
    });
    const answer = await response.text();
    if (response.status !== 201) throw await protocolFailure('WHEP playback', response, answer);
    const location = response.headers.get('location');
    if (!location) throw new Error('WHEP playback response omitted its resource URL.');
    const resourceUrl = resolveResourceUrl(location, url);
    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    return {
      peer,
      stream,
      resourceUrl,
      stop: async () => {
        await stopResource(resourceUrl, token, fetchImpl);
        try { peer.close(); } catch { /* already closed */ }
        stream.getTracks().forEach(track => track.stop?.());
      },
    };
  } catch (error) {
    peer.close();
    throw error;
  }
}

export function clampMiniOffset(offset, stage, preview, gap = 14) {
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const baseLeft = Math.max(stage.width - preview.width - gap, 0);
  return {
    x: clamp(offset.x, -baseLeft, gap),
    y: clamp(offset.y, -gap, Math.max(stage.height - preview.height - gap, -gap)),
  };
}
