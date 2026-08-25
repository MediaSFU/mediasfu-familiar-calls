import { MediaStream, mediaDevices, RTCPeerConnection } from 'react-native-webrtc';
import { consumeWhep, publishWhip } from './protocol';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class NativeWhipWhepTransport {
  constructor({ api, onState, fetchImpl = fetch }) {
    this.api = api;
    this.onState = onState;
    this.fetchImpl = fetchImpl;
    this.cancelled = false;
    this.localStream = null;
    this.remoteStream = null;
    this.screenStream = null;
    this.remoteScreenActive = false;
    this.publisher = null;
    this.playback = null;
  }

  snapshot(phase, error = '') {
    this.onState?.({
      phase, error, localStream: this.localStream, remoteStream: this.remoteStream,
      screenStream: this.screenStream, remoteScreenActive: this.remoteScreenActive,
    });
  }

  async start({ session, identity }) {
    this.cancelled = false;
    this.snapshot('Requesting microphone and camera…');
    try {
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: session.callType === 'audio' ? false : {
          facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30,
        },
      });
      this.snapshot('Publishing with WHIP…');
      const prepared = await this.api.preparePublisher({
        sessionId: session.id, userId: identity.userId, displayName: identity.displayName,
      });
      this.publisher = await publishWhip({
        ...prepared.data.publisher,
        stream: this.localStream,
        fetchImpl: this.fetchImpl,
        PeerConnection: RTCPeerConnection,
      });
      this.snapshot('Waiting for contact media…');
      while (!this.cancelled) {
        const peer = await this.api.preparePeer({ sessionId: session.id, userId: identity.userId });
        this.remoteScreenActive = peer.data.peerPresentation?.screenActive === true;
        if (!peer.data.ready) {
          this.snapshot(peer.data.reason === 'peer_media_not_active' ? 'Contact media is connecting…' : 'Ringing…');
          await wait(1000);
          continue;
        }
        if (!this.playback) {
          this.playback = await consumeWhep({
            ...peer.data.playback,
            fetchImpl: this.fetchImpl,
            PeerConnection: RTCPeerConnection,
            Stream: MediaStream,
          });
          this.remoteStream = this.playback.stream;
          this.playback.peer.ontrack = event => {
            if (event.track && !this.remoteStream.getTracks().includes(event.track)) {
              this.remoteStream.addTrack(event.track);
            }
            this.snapshot('Live');
          };
        }
        this.snapshot('Live');
        await wait(1000);
      }
    } catch (error) {
      if (!this.cancelled) this.snapshot('Connection issue', error?.message || String(error));
      throw error;
    }
  }

  async toggleScreen({ sessionId, userId }) {
    if (this.screenStream) {
      const camera = this.localStream?.getVideoTracks?.()[0] || null;
      const sender = this.publisher?.peer?.getSenders?.().find(item => item.track?.kind === 'video');
      await this.api.updatePresentation({ sessionId, userId, screenActive: false });
      await sender?.replaceTrack(camera);
      this.screenStream.getTracks().forEach(track => track.stop?.());
      this.screenStream = null;
      this.snapshot('Live');
      return false;
    }
    if (typeof mediaDevices.getDisplayMedia !== 'function') {
      throw new Error('This native WebRTC runtime does not expose screen capture.');
    }
    const display = await mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = display.getVideoTracks?.()[0];
    const sender = this.publisher?.peer?.getSenders?.().find(item => item.track?.kind === 'video');
    if (!screenTrack || !sender) {
      display.getTracks?.().forEach(track => track.stop?.());
      throw new Error('The active WHIP publisher has no replaceable video sender.');
    }
    await sender.replaceTrack(screenTrack);
    try {
      await this.api.updatePresentation({ sessionId, userId, screenActive: true });
    } catch (error) {
      await sender.replaceTrack(this.localStream?.getVideoTracks?.()[0] || null);
      display.getTracks?.().forEach(track => track.stop?.());
      throw error;
    }
    this.screenStream = display;
    screenTrack.onended = () => {
      if (this.screenStream === display) this.toggleScreen({ sessionId, userId }).catch(() => {});
    };
    this.snapshot('Live');
    return true;
  }

  toggleAudio() {
    const tracks = this.localStream?.getAudioTracks?.() || [];
    const enabled = !tracks.some(track => track.enabled !== false);
    tracks.forEach(track => { track.enabled = enabled; });
    return enabled;
  }

  toggleVideo() {
    const tracks = this.localStream?.getVideoTracks?.() || [];
    const enabled = !tracks.some(track => track.enabled !== false);
    tracks.forEach(track => { track.enabled = enabled; });
    return enabled;
  }

  async stop() {
    this.cancelled = true;
    const playback = this.playback;
    const publisher = this.publisher;
    this.playback = null;
    this.publisher = null;
    await Promise.allSettled([playback?.stop?.(), publisher?.stop?.()]);
    this.localStream?.getTracks?.().forEach(track => track.stop?.());
    this.screenStream?.getTracks?.().forEach(track => track.stop?.());
    this.remoteStream?.getTracks?.().forEach(track => track.stop?.());
    this.localStream = null;
    this.remoteStream = null;
    this.screenStream = null;
    this.remoteScreenActive = false;
  }
}
