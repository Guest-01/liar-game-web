import express from 'express';
import { createServer } from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createSocketServer } from './socket';
import { roomManager } from './game/RoomManager';
import { getCategoryNames } from './data/words';

// 환경 변수 로드
dotenv.config();

const app = express();
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
  const publicRooms = roomManager.getPublicRooms();
  const categories = getCategoryNames();
  res.render('index', { publicRooms, categories });
});

// 방 생성 페이지
app.get('/create', (req, res) => {
  const categories = getCategoryNames();
  res.render('create', { categories });
});

// 방 참가 페이지 (코드 입력)
app.get('/join', (req, res) => {
  const code = req.query.code || '';
  res.render('join', { code });
});

// 게임 방
app.get('/room/:code', (req, res) => {
  const { code } = req.params;
  const room = roomManager.getRoom(code);

  if (!room) {
    return res.redirect('/?error=room-not-found');
  }

  res.render('room', {
    roomCode: code,
    room: room.getInfoForClient()
  });
});

// API: 공개 방 목록
app.get('/api/rooms', (req, res) => {
  const rooms = roomManager.getPublicRooms();
  res.json({ rooms });
});

// API: 방 존재 여부 확인
app.get('/api/rooms/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    exists: true,
    canJoin: room.state === 'waiting' && room.players.length < room.maxPlayers
  });
});

// 오래된 방 정리 (매 10분마다)
setInterval(() => {
  const cleaned = roomManager.cleanupInactiveRooms();
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} inactive rooms`);
  }
}, 10 * 60 * 1000);

// 서버 시작
httpServer.listen(PORT, () => {
  console.log(`🎮 라이어 게임 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
