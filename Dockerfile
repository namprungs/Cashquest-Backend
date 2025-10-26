# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# pnpm
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY tsconfig*.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# install only prod deps
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --prod --frozen-lockfile

# copy built files
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
