import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

const getSocketUrl = () => {
  const baseUrl = getApiBaseUrl();
  if (baseUrl && typeof baseUrl === 'string' && baseUrl.startsWith('http')) {
    return baseUrl.replace(/\/api\/?$/, '');
  }
  return 'http://localhost:5000';
};

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const socketUrl = getSocketUrl();
    console.log('⚡ Connecting Socket.io client to:', socketUrl);
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('⚡ Socket.io connected successfully! Socket ID:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket.io disconnected:', reason);
    });
  }

  return socket;
};
