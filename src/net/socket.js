import { io } from 'socket.io-client';
import { SERVER_URL } from '@/config';

// WebSocket first (lower latency, no long-polling warm-up), polling as a fallback.
export const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
