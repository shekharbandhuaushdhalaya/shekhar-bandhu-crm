import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

const getSocketUrl = () => {
  if (API_BASE.startsWith('http')) {
    return API_BASE.replace(/\/api\/?$/, '');
  }
  return 'http://localhost:5001';
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
