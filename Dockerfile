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

# 클라이언트 라이브러리는 번들에 인라인되므로 런타임에 필요 없다
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 2567
CMD ["node", "dist/server/index.js"]
