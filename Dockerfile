# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 먼저 복사 (캐시 최적화)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드된 결과물 복사
COPY --from=builder /app/dist ./dist

# 정적 파일 복사 (웹 앱 전용)
COPY public ./public
COPY views ./views

# 서버 실행
EXPOSE 3000
CMD ["node", "dist/index.js"]
