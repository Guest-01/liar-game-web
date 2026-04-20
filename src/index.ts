import express from 'express';
import { createServer } from 'http';
import https from 'https';
import http from 'http';
import path from 'path';
import { createSocketServer } from './socket';
import { roomManager } from './game/RoomManager';
import { getCategoryNames } from './data/words';
import logger from './logger';

// 버전 정보
const { version } = require('../package.json');

const app = express();
app.set('trust proxy', 1);

// 모든 뷰에서 사용할 수 있는 전역 변수
app.locals.version = version;
app.locals.baseUrl = process.env.BASE_URL || 'https://liar-game.guest-01.dev';
app.locals.isProd = process.env.NODE_ENV === 'production';
app.locals.feedbackEnabled = false;
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
  res.render('index', {
    lobbyRooms,
    categories,
    path: '/',
    description: '누가 라이어인지 찾아내는 실시간 추리 게임. 친구들과 방을 만들거나 참가하세요!'
  });
});

// 방 생성 페이지
app.get('/create', (req, res) => {
  res.render('create', {
    title: '방 만들기',
    path: '/create',
    description: '새로운 게임 방을 만들고 친구들을 초대하세요.'
  });
});

// 게임 방
app.get('/room/:id', (req, res) => {
  const { id } = req.params;
  const room = roomManager.getRoom(id);

  if (!room) {
    return res.redirect('/?error=room-not-found');
  }

  const categories = getCategoryNames();
  res.render('room', {
    roomId: id,
    room: room.getInfoForClient(),
    categories,
    title: room.name,
    path: `/room/${id}`,
    description: `${room.name} - 지금 참가하여 라이어를 찾아보세요!`
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

// API: 피드백 제출
const feedbackCooldowns = new Map<string, number>();

function sendToDiscordWebhook(payload: object): void {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const url = new URL(webhookUrl);
    const postData = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        logger.warn({ status: res.statusCode }, 'Discord 웹훅 전송 실패');
      }
      res.resume();
    });

    req.on('error', (err) => {
      logger.warn({ err: err.message }, 'Discord 웹훅 에러');
    });

    req.write(postData);
    req.end();
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Discord 웹훅 URL 파싱 실패');
  }
}

app.post('/api/feedback', (req, res) => {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    return res.status(404).json({ error: 'Feedback is not available' });
  }

  const { sentiment, message, roomId, nickname } = req.body;

  // 감정 검증
  const validSentiments = ['good', 'neutral', 'bad'];
  if (!sentiment || !validSentiments.includes(sentiment)) {
    return res.status(400).json({ error: '유효하지 않은 피드백입니다.' });
  }

  // Rate limiting by IP
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const lastSubmit = feedbackCooldowns.get(clientIp);
  if (lastSubmit && Date.now() - lastSubmit < 60000) {
    return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
  }

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 메시지 sanitize
  const sanitizedMessage = message
    ? escape(String(message).slice(0, 500))
    : '';

  // 닉네임 sanitize
  const sanitizedNickname = nickname
    ? escape(String(nickname).slice(0, 20))
    : '';

  const sentimentEmoji: Record<string, string> = {
    good: '😊', neutral: '😐', bad: '😞'
  };

  let content = `[${sentimentEmoji[sentiment]}][방: ${roomId || '로비'}]`;
  if (sanitizedNickname) {
    content += `[닉네임: ${sanitizedNickname}]`;
  }
  if (sanitizedMessage) {
    content += ` ${sanitizedMessage}`;
  }

  sendToDiscordWebhook({ content });

  feedbackCooldowns.set(clientIp, Date.now());
  logger.info({ roomId: roomId || 'lobby', sentiment, nickname: sanitizedNickname || undefined }, '피드백 제출');
  res.json({ success: true });
});

// 오래된 방 정리 (매 10분마다)
setInterval(() => {
  const cleaned = roomManager.cleanupInactiveRooms();
  if (cleaned > 0) {
    logger.info({ cleaned }, `비활성 방 ${cleaned}개 정리됨`);
  }
  // 피드백 rate limit 쿨다운 정리
  const now = Date.now();
  for (const [ip, time] of feedbackCooldowns) {
    if (now - time > 120000) feedbackCooldowns.delete(ip);
  }
}, 10 * 60 * 1000);

type WebhookValidation =
  | { status: 'valid'; name: string }
  | { status: 'invalid'; reason: string }
  | { status: 'unknown'; reason: string };

function validateDiscordWebhook(): Promise<WebhookValidation> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return Promise.resolve({ status: 'invalid', reason: 'DISCORD_WEBHOOK_URL 미설정' });
  }

  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    return Promise.resolve({ status: 'invalid', reason: 'URL 형식이 잘못됨' });
  }

  return new Promise((resolve) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const info = JSON.parse(body);
            resolve({ status: 'valid', name: info.name || '(이름 없음)' });
          } catch {
            resolve({ status: 'unknown', reason: '응답 파싱 실패' });
          }
        } else if (res.statusCode === 404 || res.statusCode === 401) {
          resolve({ status: 'invalid', reason: `HTTP ${res.statusCode}` });
        } else {
          resolve({ status: 'unknown', reason: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ status: 'unknown', reason: `네트워크 오류: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'unknown', reason: '타임아웃' });
    });

    req.end();
  });
}

// 서버 시작
httpServer.listen(PORT, async () => {
  logger.info({ port: PORT, version }, `🎮 라이어 게임 v${version} 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);

  if (!process.env.DISCORD_WEBHOOK_URL) {
    logger.info('💤 피드백 기능 비활성화됨 (DISCORD_WEBHOOK_URL 미설정)');
    return;
  }

  const result = await validateDiscordWebhook();
  if (result.status === 'valid') {
    app.locals.feedbackEnabled = true;
    logger.info({ webhookName: result.name }, `✉️  피드백 기능 활성화됨 — "${result.name}"으로 전송`);
  } else if (result.status === 'invalid') {
    logger.error(`❌ DISCORD_WEBHOOK_URL이 유효하지 않습니다 (${result.reason}). 피드백 기능을 비활성화합니다.`);
  } else {
    app.locals.feedbackEnabled = true;
    logger.warn(`⚠️  웹훅 조회 실패 (${result.reason}). 피드백 기능은 유지되지만 전송이 실패할 수 있습니다.`);
  }
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
