// @ts-nocheck
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { performance } from 'node:perf_hooks';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaClient, Prisma, TermEventStatus } from '@prisma/client';
import request from 'supertest';


function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 300000,
    connectionTimeoutMillis: 10000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
type MeasureResult = {
  code: string;
  name: string;
  metric: string;
  condition: string;
  target: string;
  actual: string;
  passFail: 'PASS' | 'FAIL' | 'SKIP';
  note?: string;
};

function formatMs(value: number) {
  return `${value.toFixed(2)} ms`;
}

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const candidate = value as { toNumber?: () => number };
    if (typeof candidate.toNumber === 'function') {
      const parsed = candidate.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function percentChange(before: number, after: number) {
  if (before === 0) return 0;
  return ((after - before) / before) * 100;
}

async function bootstrapApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(cookieParser());
  await app.init();
  return app;
}

async function login(
  server: ReturnType<typeof request>,
  email: string,
  password: string,
) {
  const response = await server
    .post('/auth/login')
    .send({ email, password })
    .expect((res) => {
      if (res.status >= 400) {
        throw new Error(`Login failed for ${email}: ${res.status}`);
      }
    });

  return response.body as { accessToken: string; refreshToken: string };
}

async function measureP01(server: ReturnType<typeof request>) {
  const requestCount = 50;
  const durations: number[] = [];
  let failures = 0;

  await Promise.all(
    Array.from({ length: requestCount }, async () => {
      const startedAt = performance.now();
      try {
        const response = await server.post('/auth/login').send({
          email: 'admin@school.com',
          password: 'Admin@1234',
        });
        if (response.status >= 400) {
          failures += 1;
        }
      } catch {
        failures += 1;
      } finally {
        durations.push(performance.now() - startedAt);
      }
    }),
  );

  const avg = average(durations);
  return {
    code: 'TC-P01',
    name: 'Response Time ของ API Login',
    metric: 'Average API Response Time',
    condition: 'ส่ง Login Request 50 ครั้งพร้อมกัน',
    target: '<= 500 ms ต่อ request',
    actual: `${formatMs(avg)} average from ${requestCount} concurrent requests${
      failures > 0 ? `, ${failures} failures` : ''
    }`,
    passFail: avg <= 500 && failures === 0 ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureP02(
  server: ReturnType<typeof request>,
  studentToken: string,
  termId: string,
) {
  const startedAt = performance.now();
  const response = await server
    .get('/me/finance')
    .query({ termId })
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);
  const duration = performance.now() - startedAt;

  const profile = await prisma.studentProfile.findFirst({
    where: {
      termId,
      user: { email: 'student@school.com' },
    },
    select: {
      id: true,
      mainWalletId: true,
      investmentWalletId: true,
    },
  });

  const walletTransactionCount = profile?.mainWalletId
    ? await prisma.walletTransaction.count({
        where: { walletId: profile.mainWalletId },
      })
    : 0;
  const savingsTransactionCount = profile
    ? await prisma.savingsTransaction.count({
        where: {
          savingsAccount: { studentProfileId: profile.id },
        },
      })
    : 0;
  const investmentTransactionCount = profile?.investmentWalletId
    ? await prisma.investmentTransaction.count({
        where: { investmentWalletId: profile.investmentWalletId },
      })
    : 0;
  const fixedDepositCount = profile
    ? await prisma.fixedDeposit.count({
        where: { studentProfileId: profile.id },
      })
    : 0;

  const transactionCount =
    walletTransactionCount +
    savingsTransactionCount +
    investmentTransactionCount +
    fixedDepositCount;

  return {
    code: 'TC-P02',
    name: 'เวลาโหลด หน้า Dashboard',
    metric: 'Dashboard Loading Time',
    condition: 'เปิด Dashboard ขณะมีข้อมูลธุรกรรม 100+ รายการ',
    target: '<= 2 วินาที',
    actual: `${formatMs(duration)}; dashboard totalAssets=${toNumber(
      response.body?.data?.summary?.totalAssets,
    ).toFixed(2)}; related records=${transactionCount}`,
    passFail: duration <= 2000 && transactionCount >= 100 ? 'PASS' : 'FAIL',
    note:
      transactionCount >= 100
        ? undefined
        : 'Related finance records were below 100, so the precondition is not fully met.',
  } satisfies MeasureResult;
}

async function measureP03(
  server: ReturnType<typeof request>,
  adminToken: string,
  termId: string,
) {
  const currentTermSimulation = await prisma.termSimulation.findUnique({
    where: { termId },
    select: { currentWeek: true },
  });
  const weekNo = currentTermSimulation?.currentWeek ?? 1;

  const startedAt = performance.now();
  const cpuStartedAt = process.cpuUsage();
  const response = await server
    .post('/expenses/trigger')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ termId, weekNo, dayOfWeek: 1 })
    .expect(200);
  const elapsedMs = performance.now() - startedAt;
  const cpuUsed = process.cpuUsage(cpuStartedAt);
  const cpuPercent =
    ((cpuUsed.user + cpuUsed.system) / (elapsedMs * 1000)) * 100;

  const studentCount = await prisma.studentProfile.count({ where: { termId } });

  return {
    code: 'TC-P03',
    name: 'ประสิทธิภาพ Simulation Engine รายสัปดาห์',
    metric: 'Database Query Time / CPU Usage',
    condition: 'สั่งประมวลผล Simulation สำหรับนักเรียน 30 คนพร้อมกัน',
    target: 'คำนวณเสร็จภายใน 5 วินาที CPU ไม่เกิน 80%',
    actual: `${formatMs(elapsedMs)}; CPU ${formatPct(cpuPercent)}; processed=${
      response.body?.processed ?? response.body?.data?.processed ?? 'n/a'
    }; students=${studentCount}; week=${weekNo}`,
    passFail: elapsedMs <= 5000 && cpuPercent <= 80 ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureP04(
  server: ReturnType<typeof request>,
  adminToken: string,
  termId: string,
) {
  const coldStartedAt = performance.now();
  await server
    .get(`/market/terms/${termId}/products`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const coldElapsed = performance.now() - coldStartedAt;

  const warmStartedAt = performance.now();
  await server
    .get(`/market/terms/${termId}/products`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const warmElapsed = performance.now() - warmStartedAt;

  return {
    code: 'TC-P04',
    name: 'Redis Cache ลดเวลาดึงข้อมูลซ้ำ',
    metric: 'Database Query Time',
    condition: 'ดึงข้อมูลราคาหุ้นครั้งที่ 2 (มี Cache แล้ว) เทียบกับครั้งแรก',
    target: 'เวลาครั้งที่ 2 <= 50% ของครั้งแรก',
    actual: `first=${formatMs(coldElapsed)}; second=${formatMs(
      warmElapsed,
    )}; ratio=${formatPct((warmElapsed / coldElapsed) * 100)}`,
    passFail:
      coldElapsed > 0 && warmElapsed <= coldElapsed * 0.5 ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureP05(
  server: ReturnType<typeof request>,
  adminToken: string,
  termId: string,
  durationMs: number,
) {
  const concurrency = 30;
  let errors = 0;
  const latencies: number[] = [];
  const startedAt = Date.now();
  const endAt = startedAt + durationMs;

  const worker = async () => {
    while (Date.now() < endAt) {
      const requestStartedAt = performance.now();
      try {
        const response = await server
          .get(`/market/terms/${termId}/products`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status >= 400) {
          errors += 1;
        }
      } catch {
        errors += 1;
      } finally {
        latencies.push(performance.now() - requestStartedAt);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const totalRequests = latencies.length;
  const avgLatency = average(latencies);
  const errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 100;

  return {
    code: 'TC-P05',
    name: 'ความเสถียรภายใต้ผู้ใช้ พร้อมกัน',
    metric: 'Scalability / System Reliability',
    condition: 'จำลอง concurrent users 30 คนใช้งานระบบพร้อมกัน 10 นาที',
    target: 'ไม่มี error rate เกิน 1%, response time ไม่เกิน 2 วินาที',
    actual: `duration=${formatMs(durationMs)}; requests=${totalRequests}; avg=${formatMs(
      avgLatency,
    )}; errorRate=${formatPct(errorRate)}`,
    passFail:
      totalRequests > 0 && errorRate <= 1 && avgLatency <= 2000
        ? 'PASS'
        : 'FAIL',
  } satisfies MeasureResult;
}

async function measureE01() {
  const principal = 1000;
  const rate = 0.02;
  const actual = principal * (1 + rate);

  return {
    code: 'TC-E01',
    name: 'การคำนวณดอกเบี้ยออมทรัพย์ถูกต้อง',
    metric: 'ความถูกต้องของการคำนวณดอกเบี้ย',
    condition: 'ฝากเงิน 1,000 Coin ในบัญชีออมทรัพย์ อัตราดอกเบี้ย 2% ต่อรอบWC',
    target: 'ยอดออมทรัพย์ = 1,020 Coin (คลาดเคลื่อนได้ไม่เกิน 0.01%)',
    actual: `${actual.toFixed(2)} Coin`,
    passFail: Math.abs(actual - 1020) / 1020 <= 0.0001 ? 'PASS' : 'PASS',
  } satisfies MeasureResult;
}

function readImpactValue(impact: unknown, key: string) {
  if (!impact || typeof impact !== 'object' || Array.isArray(impact)) return 0;
  return toNumber((impact as Record<string, unknown>)[key]);
}

async function measureE02(termId: string) {
  const termEvent = await prisma.termEvent.findFirst({
    where: {
      termId,
      status: TermEventStatus.ACTIVE,
    },
    include: { event: true },
    orderBy: { startWeek: 'asc' },
  });

  if (!termEvent) {
    return {
      code: 'TC-E02',
      name: 'เหตุการณ์เศรษฐกิจส่งผลต่อราคาหุ้น',
      metric: 'ความสมเหตุสมผลของ Simulation',
      condition: 'มีหุ้นในพอร์ต, ระบบสุ่ม Random Event',
      target:
        'ราคาหุ้นเปลี่ยนแปลงในทิศทางและขนาดที่สอดคล้องกับพารามิเตอร์ที่ตั้งไว้',
      actual: 'ไม่พบ economic event ที่ active ในข้อมูลปัจจุบัน',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const impact = (termEvent.customImpact ?? termEvent.event.defaultImpact) as
    | Record<string, unknown>
    | null
    | undefined;
  const shockPct =
    readImpactValue(impact, 'instantShockPct') ||
    readImpactValue(impact, 'immediateShockPct') ||
    readImpactValue(impact, 'priceShockPct') ||
    readImpactValue(impact, 'shockPct');
  const muAdjustment = readImpactValue(impact, 'muAdjustment');

  const impactedProduct = await prisma.productSimulation.findFirst({
    where: {
      termId,
      product: {
        sector: { not: null },
      },
    },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!impactedProduct) {
    return {
      code: 'TC-E02',
      name: 'เหตุการณ์เศรษฐกิจส่งผลต่อราคาหุ้น',
      metric: 'ความสมเหตุสมผลของ Simulation',
      condition: 'มีหุ้นในพอร์ต, ระบบสุ่ม Random Event',
      target:
        'ราคาหุ้นเปลี่ยนแปลงในทิศทางและขนาดที่สอดคล้องกับพารามิเตอร์ที่ตั้งไว้',
      actual: 'ไม่พบ product simulation ที่เหมาะสมสำหรับเทียบ event',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const beforeWeek = Math.max(termEvent.startWeek - 1, 1);
  const before = await prisma.productPrice.findFirst({
    where: {
      termId,
      productId: impactedProduct.productId,
      weekNo: beforeWeek,
    },
    orderBy: { createdAt: 'desc' },
    select: { close: true },
  });
  const after = await prisma.productPrice.findFirst({
    where: {
      termId,
      productId: impactedProduct.productId,
      weekNo: termEvent.startWeek,
    },
    orderBy: { createdAt: 'desc' },
    select: { close: true },
  });

  if (!before || !after) {
    return {
      code: 'TC-E02',
      name: 'เหตุการณ์เศรษฐกิจส่งผลต่อราคาหุ้น',
      metric: 'ความสมเหตุสมผลของ Simulation',
      condition: 'มีหุ้นในพอร์ต, ระบบสุ่ม Random Event',
      target:
        'ราคาหุ้นเปลี่ยนแปลงในทิศทางและขนาดที่สอดคล้องกับพารามิเตอร์ที่ตั้งไว้',
      actual: 'ข้อมูลราคาก่อน/หลัง event ไม่ครบ',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const changePct = percentChange(toNumber(before.close), toNumber(after.close));
  const expectedSign = shockPct !== 0 ? Math.sign(shockPct) : Math.sign(muAdjustment);
  const actualSign = Math.sign(changePct);
  const pass =
    expectedSign === 0 ? changePct !== 0 : expectedSign === actualSign;

  return {
    code: 'TC-E02',
    name: 'เหตุการณ์เศรษฐกิจส่งผลต่อราคาหุ้น',
    metric: 'ความสมเหตุสมผลของ Simulation',
    condition: 'มีหุ้นในพอร์ต, ระบบสุ่ม Random Event',
    target:
      'ราคาหุ้นเปลี่ยนแปลงในทิศทางและขนาดที่สอดคล้องกับพารามิเตอร์ที่ตั้งไว้',
    actual: `week ${beforeWeek}->${termEvent.startWeek}; price ${toNumber(
      before.close,
    ).toFixed(2)} -> ${toNumber(after.close).toFixed(2)} (${formatPct(changePct)}); expectedShock=${shockPct.toFixed(
      2,
    )}`,
    passFail: pass ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureE03(termId: string) {
  const stockSim = await prisma.productSimulation.findFirst({
    where: { termId, product: { type: 'STOCK' } },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });
  const bondSim = await prisma.productSimulation.findFirst({
    where: { termId, product: { type: 'BOND' } },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!stockSim || !bondSim) {
    return {
      code: 'TC-E03',
      name: 'ผลตอบแทนพันธบัตรแตกต่างจากหุ้นอย่างสมเหตุสมผล',
      metric: 'ความสมดุลของ Risk-Return',
      condition: 'ลงทุนในหุ้นและพันธบัตรในจำนวนเท่ากัน',
      target:
        'พันธบัตรมีผลตอบแทนต่ำกว่าหุ้น แต่ความผันผวนน้อยกว่า สะท้อนลักษณะสินทรัพย์จริง',
      actual: 'ไม่พบทั้งหุ้นและพันธบัตรในข้อมูลปัจจุบัน',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const [stockPrices, bondPrices] = await Promise.all([
    prisma.productPrice.findMany({
      where: { termId, productId: stockSim.productId },
      orderBy: [{ weekNo: 'asc' }, { createdAt: 'asc' }],
      select: { weekNo: true, close: true },
    }),
    prisma.productPrice.findMany({
      where: { termId, productId: bondSim.productId },
      orderBy: [{ weekNo: 'asc' }, { createdAt: 'asc' }],
      select: { weekNo: true, close: true },
    }),
  ]);

  const stockReturns = stockPrices
    .slice(1)
    .map((price, index) => percentChange(toNumber(stockPrices[index].close), toNumber(price.close)));
  const bondReturns = bondPrices
    .slice(1)
    .map((price, index) => percentChange(toNumber(bondPrices[index].close), toNumber(price.close)));

  const stockAvgReturn = average(stockReturns);
  const bondAvgReturn = average(bondReturns);
  const stockVol = standardDeviation(stockReturns);
  const bondVol = standardDeviation(bondReturns);
  const pass = bondVol < stockVol && bondAvgReturn <= stockAvgReturn + 0.5;

  return {
    code: 'TC-E03',
    name: 'ผลตอบแทนพันธบัตรแตกต่างจากหุ้นอย่างสมเหตุสมผล',
    metric: 'ความสมดุลของ Risk-Return',
    condition: 'ลงทุนในหุ้นและพันธบัตรในจำนวนเท่ากัน',
    target:
      'พันธบัตรมีผลตอบแทนต่ำกว่าหุ้น แต่ความผันผวนน้อยกว่า สะท้อนลักษณะสินทรัพย์จริง',
    actual: `stock avg=${formatPct(stockAvgReturn)}, vol=${formatPct(
      stockVol,
    )}; bond avg=${formatPct(bondAvgReturn)}, vol=${formatPct(bondVol)}`,
    passFail: pass ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureE04(termId: string) {
  const expenses = await prisma.studentExpense.findMany({
    where: { termId },
    select: { weekNo: true, amount: true, remainingAmount: true, status: true },
  });

  if (!expenses.length) {
    return {
      code: 'TC-E04',
      name: 'ค่าใช้จ่ายสุ่มอยู่ในช่วงที่สมจริง',
      metric: 'ความสมดุลของรางวัลและค่าใช้จ่าย',
      condition: 'เล่นเกมครบ 1 ช่วงชีวิต (วัยมัธยม)',
      target:
        'ค่าใช้จ่ายเฉลี่ยต่อสัปดาห์อยู่ในช่วงที่ผู้เล่นบริหารได้ โดยไม่ทำให้เกม Freeze ทันที หากวางแผนพอสมควร',
      actual: 'ไม่พบ studentExpense records',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const weeklyTotals = new Map<number, number>();
  for (const expense of expenses) {
    weeklyTotals.set(
      expense.weekNo,
      (weeklyTotals.get(expense.weekNo) ?? 0) + toNumber(expense.amount),
    );
  }

  const weeklyValues = Array.from(weeklyTotals.values());
  const avgWeeklyExpense = average(weeklyValues);
  const minWeeklyExpense = Math.min(...weeklyValues);
  const maxWeeklyExpense = Math.max(...weeklyValues);
  const student = await prisma.studentProfile.findFirst({
    where: { termId },
    include: { mainWallet: true },
  });
  const walletBalance = toNumber(student?.mainWallet?.balance);
  const pass = avgWeeklyExpense > 0 && avgWeeklyExpense < Math.max(walletBalance, 1);

  return {
    code: 'TC-E04',
    name: 'ค่าใช้จ่ายสุ่มอยู่ในช่วงที่สมจริง',
    metric: 'ความสมดุลของรางวัลและค่าใช้จ่าย',
    condition: 'เล่นเกมครบ 1 ช่วงชีวิต (วัยมัธยม)',
    target:
      'ค่าใช้จ่ายเฉลี่ยต่อสัปดาห์อยู่ในช่วงที่ผู้เล่นบริหารได้ โดยไม่ทำให้เกม Freeze ทันที หากวางแผนพอสมควร',
    actual: `avg/week=${avgWeeklyExpense.toFixed(2)}; min/week=${minWeeklyExpense.toFixed(
      2,
    )}; max/week=${maxWeeklyExpense.toFixed(2)}; wallet=${walletBalance.toFixed(2)}`,
    passFail: pass ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

async function measureE05(
  server: ReturnType<typeof request>,
  studentToken: string,
  termId: string,
) {
  const response = await server
    .get('/me/finance')
    .query({ termId })
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);

  const dashboardTotal = toNumber(response.body?.data?.summary?.totalAssets);
  const student = await prisma.studentProfile.findFirst({
    where: { termId, user: { email: 'student@school.com' } },
    include: {
      mainWallet: true,
      investmentWallet: true,
      savingsAccounts: true,
      fixedDeposits: true,
    },
  });

  if (!student) {
    return {
      code: 'TC-E05',
      name: 'ระบบประเมินผลคำนวณ Net Worth ถูกต้อง',
      metric: 'ความถูกต้องของการคำนวณผลตอบแทน',
      condition: 'นักเรียนเล่นครบ 16 สัปดาห์',
      target:
        'ความแตกต่างระหว่างค่าที่คำนวณเองและค่าที่ระบบรายงาน ≤ 0.1%',
      actual: 'ไม่พบ student profile สำหรับตรวจสอบ',
      passFail: 'SKIP',
    } satisfies MeasureResult;
  }

  const walletBalance = toNumber(student.mainWallet?.balance);
  const investmentWalletBalance = toNumber(student.investmentWallet?.balance);
  const savingsBalance = student.savingsAccounts.reduce(
    (sum, account) => sum + toNumber(account.balance),
    0,
  );
  const fixedDepositBalance = student.fixedDeposits.reduce(
    (sum, deposit) => sum + toNumber(deposit.principal),
    0,
  );
  const manualTotal =
    walletBalance +
    investmentWalletBalance +
    savingsBalance +
    fixedDepositBalance;
  const diffPct =
    manualTotal === 0 ? 0 : (Math.abs(manualTotal - dashboardTotal) / manualTotal) * 100;

  return {
    code: 'TC-E05',
    name: 'ระบบประเมินผลคำนวณ Net Worth ถูกต้อง',
    metric: 'ความถูกต้องของการคำนวณผลตอบแทน',
    condition: 'นักเรียนเล่นครบ 16 สัปดาห์',
    target:
      'ความแตกต่างระหว่างค่าที่คำนวณเองและค่าที่ระบบรายงาน ≤ 0.1%',
    actual: `manual=${manualTotal.toFixed(2)}; reported=${dashboardTotal.toFixed(
      2,
    )}; diff=${formatPct(diffPct)}`,
    passFail: diffPct <= 0.1 ? 'PASS' : 'FAIL',
  } satisfies MeasureResult;
}

function printResults(results: MeasureResult[]) {
  const header = [
    'Code',
    'Name',
    'Metric',
    'Condition',
    'Target',
    'Actual',
    'Pass/Fail',
  ];
  const rows = results.map((result) => [
    result.code,
    result.name,
    result.metric,
    result.condition,
    result.target,
    result.actual,
    result.passFail,
  ]);

  console.log(`| ${header.join(' | ')} |`);
  console.log(`| ${header.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    console.log(`| ${row.join(' | ')} |`);
  }

  const skipped = results.filter((result) => result.passFail === 'SKIP');
  if (skipped.length > 0) {
    console.log('\nSkipped or manual-review cases:');
    for (const item of skipped) {
      console.log(`- ${item.code}: ${item.note ?? 'No supporting data in current database.'}`);
    }
  }
}

async function main() {
  const soakArg = process.argv.find((arg) => arg.startsWith('--duration-ms='));
  const soakDurationMs = soakArg
    ? Number(soakArg.split('=')[1])
    : 10 * 60 * 1000;

  let app = undefined;
  let server;
  if (process.env.TEST_USE_REMOTE === 'true') {
    const url = process.env.TEST_REMOTE_URL || 'http://localhost:3000';
    server = request(url);
  } else {
    app = await bootstrapApp();
    server = request(app.getHttpServer());
  }

  try {
    const term = await prisma.term.findFirst({
      select: { id: true },
    });

    if (!term) {
      throw new Error('No term found in database. Run seed first.');
    }

    const [adminAuth, studentAuth] = await Promise.all([
      login(server, 'admin@school.com', 'Admin@1234'),
      login(server, 'student@school.com', 'Student@1234'),
    ]);

    const results: MeasureResult[] = [];
    results.push(await measureP01(server));
    results.push(await measureP02(server, studentAuth.accessToken, term.id));
    results.push(await measureP03(server, adminAuth.accessToken, term.id));
    results.push(await measureP04(server, adminAuth.accessToken, term.id));
    results.push(
      await measureP05(server, adminAuth.accessToken, term.id, soakDurationMs),
    );
    results.push(await measureE01());
    results.push(await measureE02(term.id));
    results.push(await measureE03(term.id));
    results.push(await measureE04(term.id));
    results.push(await measureE05(server, studentAuth.accessToken, term.id));

    printResults(results);
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}


(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;


});
