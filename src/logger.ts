import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // 개발 환경에서만 pino-pretty 사용
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
      hideObject: true, // key-value 쌍을 숨기고 메시지만 표시
    }
  } : undefined,
});

export default logger;
