# CashQuest Backend

Backend API ของโปรเจกต์ CashQuest (NestJS + Prisma + PostgreSQL)

## สิ่งที่ต้องมีในเครื่อง

- Node.js 20+
- pnpm (โปรเจกต์ล็อกไว้ที่ pnpm 10)
- Docker Desktop (หรือ Docker Engine + Docker Compose)

## Quick Start (สำหรับคนเพิ่ง clone)

1) ติดตั้ง dependencies

```bash
pnpm install
```

2) สร้างไฟล์ environment

```bash
cp .env.example .env
```

> ค่า `DATABASE_URL` ใน `.env.example` ถูกตั้งให้ใช้กับ PostgreSQL ใน `docker-compose.yml` แล้ว

3) เปิด PostgreSQL ด้วย Docker

```bash
docker compose up -d postgres
```

4) รัน migration และ seed ข้อมูลเริ่มต้น

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

5) รัน backend

```bash
pnpm run start:dev
```

API จะรันที่ `http://localhost:3000`

---

## คำสั่ง Docker ที่ใช้บ่อย

```bash
# เปิด DB
docker compose up -d postgres

# ดู log ของ DB
docker compose logs -f postgres

# ปิด DB
docker compose down
```

## คำสั่ง Prisma ที่ใช้บ่อย

```bash
# สร้าง Prisma Client ใหม่ (หลังแก้ schema)
pnpm prisma generate

# ใช้ migration ที่มีอยู่แล้ว (เหมาะกับเครื่องใหม่ / CI)
pnpm prisma migrate deploy

# สร้าง migration ใหม่จากการแก้ schema แล้ว apply ทันที (dev)
pnpm prisma migrate dev --name your_migration_name

# Seed ข้อมูล
pnpm prisma db seed

# ดูสถานะ migration
pnpm prisma migrate status

# เปิด Prisma Studio
pnpm prisma studio

# รีเซ็ตฐานข้อมูลและรัน migration+seed ใหม่ (ใช้เฉพาะ dev)
pnpm prisma migrate reset
```

## Test

```bash
pnpm run test
pnpm run test:e2e
pnpm run test:cov
```

## หมายเหตุ

- หากเปลี่ยนค่าใน `.env` ให้ restart server ใหม่
- ไฟล์ seed จะสร้างบัญชีเริ่มต้น:
  - email: `admin@school.com`
  - password: `Admin@1234`
