# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY tsconfig*.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate
RUN pnpm run build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --prod --frozen-lockfile

# ใช้ dlx เพราะ prisma CLI ไม่ได้อยู่ใน prod dependencies
RUN pnpm dlx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
