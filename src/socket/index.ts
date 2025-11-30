import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './handlers';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  setupSocketHandlers(io);

  return io;
}
