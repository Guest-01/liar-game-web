# ── Build stage ──────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# 의존성 먼저 (레이어 캐시)
COPY package*.json ./
RUN npm ci

# 소스 복사 후 빌드
#   vite build → dist/public   (클라이언트 번들 + public/ 정적 자산)
#   tsc        → dist/server, dist/shared
COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# 컨테이너는 v1과 같은 3000번에서 듣는다. 운영의 리버스 프록시(Caddy)가 v1 시절
# 설정 그대로 이 포트를 가리키므로, 이미지만 바꿔 끼워도 붙는다.
# (개발 기본값 2567은 scripts/dev.mjs·server/index.ts 쪽이고 여기와 무관하다.
#  PORT를 따로 주면 그 값이 이긴다.)
ENV PORT=3000

# 클라이언트 라이브러리는 번들에 인라인되므로 런타임에 필요 없다
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
