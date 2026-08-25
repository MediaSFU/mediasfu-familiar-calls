import { io } from 'socket.io-client';
import { BACKEND_BASE_URL } from './config';

export function connectCallSocket({ userId, onInvite, onJoined, onEnded, onState }) {
  const socket = io(BACKEND_BASE_URL, { transports: ['websocket'] });
  socket.on('connect', () => {
    onState?.('connected');
    socket.emit('presence:register', { userId });
    socket.emit('session:sync', { userId }, (result) => {
      if (result?.success) onJoined?.({ sessions: result.data?.sessions || [], sync: true });
    });
  });
  socket.on('connect_error', () => onState?.('reconnecting'));
  socket.on('disconnect', () => onState?.('offline'));
  socket.on('call:invite', onInvite);
  socket.on('call:joined', onJoined);
  socket.on('call:ended', onEnded);
  return socket;
}
