import express from 'express';
import { createServer } from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createSocketServer } from './socket';
import { roomManager } from './game/RoomManager';
import { getCategoryNames } from './data/words';
import logger from './logger';

// 버전 정보
const { version } = require('../package.json');

// 환경 변수 로드
dotenv.config();

const app = express();

// 모든 뷰에서 사용할 수 있는 전역 변수
app.locals.version = version;
const httpServer = createServer(app);
const io = createSocketServer(httpServer);

const PORT = process.env.PORT || 3000;

// EJS 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 정적 파일
app.use(express.static(path.join(__dirname, '../public')));

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우트

// 로비 (홈)
app.get('/', (req, res) => {
  const lobbyRooms = roomManager.getLobbyRooms();
  const categories = getCategoryNames();
  res.render('index', { lobbyRooms, categories });
});

// 방 생성 페이지
app.get('/create', (req, res) => {
  const categories = getCategoryNames();
  res.render('create', { categories });
});

// 게임 방
app.get('/room/:id', (req, res) => {
  const { id } = req.params;
  const room = roomManager.getRoom(id);

  if (!room) {
    return res.redirect('/?error=room-not-found');
  }

  res.render('room', {
    roomId: id,
    room: room.getInfoForClient()
  });
});

// API: 로비 방 목록
app.get('/api/rooms', (req, res) => {
  const rooms = roomManager.getLobbyRooms();
  res.json({ rooms });
});

// API: 방 정보 확인
app.get('/api/rooms/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    exists: true,
    canJoin: room.state === 'waiting' && room.players.length < room.maxPlayers,
    isPublic: room.isPublic
  });
});

// 오래된 방 정리 (매 10분마다)
setInterval(() => {
  const cleaned = roomManager.cleanupInactiveRooms();
  if (cleaned > 0) {
    logger.info({ cleaned }, `비활성 방 ${cleaned}개 정리됨`);
  }
}, 10 * 60 * 1000);

// 서버 시작
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, `🎮 라이어 게임 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});

// Graceful shutdown
const shutdown = () => {
  logger.info('🛑 서버를 종료합니다...');
  io.close(() => {
    httpServer.close(() => {
      logger.info('✅ 서버가 정상적으로 종료되었습니다.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
