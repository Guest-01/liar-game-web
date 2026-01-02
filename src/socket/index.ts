import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './handlers';

export function createSocketServer(httpServer: HttpServer): Server {
  // CORS 설정: 프로덕션에서는 허용된 origin만, 개발에서는 모든 origin 허용
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim());
  const corsOrigin = process.env.NODE_ENV === 'production' && allowedOrigins?.length
    ? allowedOrigins
    : '*';

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST']
    }
  });

  setupSocketHandlers(io);

  return io;
}
