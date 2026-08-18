# ⚠️ v1(v1.4.1) 기준 파일이다. v2 구조(shared/ server/ client/)에 맞지 않으므로
# 현재 상태로는 빌드되지 않는다. M1에서 package.json이 생길 때 함께 맞춘다.
# 유지하는 이유: 멀티스테이지 구조와 node:22-alpine 선택은 그대로 재사용한다.

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
COPY --from=builder /app/public/css/tailwind.css ./public/css/tailwind.css
COPY views ./views

# 서버 실행
EXPOSE 3000
CMD ["node", "dist/index.js"]
