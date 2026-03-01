// 1. Load Environment Variables ทันที
import 'dotenv/config';

import {
  EconomicEventType,
  MarketRegimeName,
  PriceGenerationType,
  Prisma,
  PrismaClient,
  ProductType,
  RiskLevel,
  TermEventStatus,
  TermStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
// ตรวจสอบ Path นี้ให้ถูกต้องตามโครงสร้างโปรเจกต์ของคุณ

// 2. สร้าง Connection Pool และ Adapter
const connectionString = `${process.env.DATABASE_URL}`;

// ตรวจสอบว่ามี URL หรือไม่ ป้องกัน Error แปลกๆ
if (!connectionString || connectionString === 'undefined') {
  throw new Error('❌ DATABASE_URL is missing. Please check your .env file.');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 3. ส่ง adapter เข้าไปใน PrismaClient
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 เริ่มต้นการ Seed ข้อมูล...');

  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const calculateTotalWeeks = (startDate: Date, endDate: Date) => {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.ceil(diffDays / 7));
  };

  const createSeededRng = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  };

  const gaussianFromRng = (rng: () => number) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // --- Logic การ Seed ข้อมูล ---

  // 1. ดึงข้อมูลสิทธิ์ทั้งหมดจาก Constant มาเป็น Array แบนๆ
  const allPermissionNames = Object.values(PERMISSIONS).flatMap((group) =>
    Object.values(group),
  );

  // 2. สร้าง/อัปเดต Permissions
  console.log('📦 กำลังบันทึก Permissions...');
  const permissionMap = new Map<string, string>();

  for (const name of allPermissionNames) {
    const perm = await prisma.permission.upsert({
      where: { name: name as string },
      update: {},
      create: { name },
    });
    permissionMap.set(name, perm.id);
  }

  // 3. ฟังก์ชันสร้าง Role และผูกสิทธิ์
  const upsertRole = async (roleName: string, permissions: string[]) => {
    console.log(`🎭 กำลังจัดการ Role: ${roleName}`);

    // แปลงชื่อ Permission เป็น ID
    const permissionIds = permissions
      .map((name) => permissionMap.get(name))
      .filter((id): id is string => !!id);

    // เตรียม Data สำหรับ create หรือ update relation
    const rolePermissionsData = permissionIds.map((id) => ({
      permissionId: id,
    }));

    return await prisma.role.upsert({
      where: { name: roleName },
      update: {
        rolePermissions: {
          deleteMany: {}, // ลบสิทธิ์เก่าทิ้งก่อน
          create: rolePermissionsData, // ใส่สิทธิ์ใหม่ที่ถูกต้อง
        },
      },
      create: {
        name: roleName,
        rolePermissions: {
          create: rolePermissionsData,
        },
      },
    });
  };

  // 4. กำหนด Role และสิทธิ์ตามต้องการ
  const superAdminRole = await upsertRole('SUPER_ADMIN', allPermissionNames);

  const staffRole = await upsertRole('STAFF', [
    PERMISSIONS.USER.CREATE,
    PERMISSIONS.USER.EDIT,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.ACADEMIC.SCHOOL_VIEW,
    PERMISSIONS.ACADEMIC.SCHOOL_EDIT,
  ]);

  const teacherRole = await upsertRole('TEACHER', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.ACADEMIC.CLASS_MANAGE,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.SIMULATION.CONTENT_MANAGE,
    PERMISSIONS.ACADEMIC.CLASSROOM_CREATE,
    PERMISSIONS.ACADEMIC.CLASSROOM_VIEW,
    PERMISSIONS.ACADEMIC.CLASSROOM_EDIT,
    PERMISSIONS.ACADEMIC.CLASSROOM_DELETE,
  ]);

  const studentRole = await upsertRole('STUDENT', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.SIMULATION.PLAY,
  ]);

  // 5. สร้างบัญชี Super Admin
  const adminEmail = 'admin@school.com';
  const hashedAdminPassword = await bcrypt.hash('Admin@1234', 10);

  console.log('👤 กำลังจัดการบัญชี Super Admin...');
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: superAdminRole.id,
    },
    create: {
      email: adminEmail,
      username: 'superadmin',
      password: hashedAdminPassword,
      roleId: superAdminRole.id,
    },
  });

  // 6. Seed ข้อมูล Dev สำหรับทีมใช้งานฟีเจอร์อื่นได้ทันที
  console.log('🏫 กำลังสร้างข้อมูล Dev: school/term/life-stage/classroom...');

  const demoSchoolName = 'CashQuest Demo School';
  const demoSchoolPlan = 'PREMIUM';

  const school =
    (await prisma.school.findFirst({ where: { name: demoSchoolName } })) ??
    (await prisma.school.create({
      data: {
        name: demoSchoolName,
        plan: demoSchoolPlan,
      },
    }));

  await prisma.school.update({
    where: { id: school.id },
    data: { plan: demoSchoolPlan },
  });

  const defaultPassword = await bcrypt.hash('Teacher@1234', 10);
  const studentPassword = await bcrypt.hash('Student@1234', 10);
  const staffPassword = await bcrypt.hash('Staff@1234', 10);

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@school.com' },
    update: {
      username: 'teacher_demo',
      roleId: teacherRole.id,
      schoolId: school.id,
      isActive: true,
    },
    create: {
      email: 'teacher@school.com',
      username: 'teacher_demo',
      password: defaultPassword,
      roleId: teacherRole.id,
      schoolId: school.id,
      isActive: true,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@school.com' },
    update: {
      username: 'student_demo',
      roleId: studentRole.id,
      schoolId: school.id,
      isActive: true,
    },
    create: {
      email: 'student@school.com',
      username: 'student_demo',
      password: studentPassword,
      roleId: studentRole.id,
      schoolId: school.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@school.com' },
    update: {
      username: 'staff_demo',
      roleId: staffRole.id,
      schoolId: school.id,
      isActive: true,
    },
    create: {
      email: 'staff@school.com',
      username: 'staff_demo',
      password: staffPassword,
      roleId: staffRole.id,
      schoolId: school.id,
      isActive: true,
    },
  });

  const termName = 'Demo Term 1/2026';
  const termStartDate = new Date('2026-01-06T00:00:00.000Z');
  const termEndDate = new Date('2026-03-15T00:00:00.000Z');
  const totalWeeks = calculateTotalWeeks(termStartDate, termEndDate);

  const existingTerm = await prisma.term.findFirst({
    where: {
      schoolId: school.id,
      name: termName,
    },
    select: { id: true },
  });

  const term = existingTerm
    ? await prisma.term.update({
        where: { id: existingTerm.id },
        data: {
          schoolId: school.id,
          name: termName,
          startDate: termStartDate,
          endDate: termEndDate,
          totalWeeks,
          status: TermStatus.ONGOING,
        },
      })
    : await prisma.term.create({
        data: {
          schoolId: school.id,
          name: termName,
          startDate: termStartDate,
          endDate: termEndDate,
          totalWeeks,
          status: TermStatus.ONGOING,
        },
      });

  await prisma.termWeek.deleteMany({ where: { termId: term.id } });

  const termWeeksData: {
    termId: string;
    weekNo: number;
    startDate: Date;
    endDate: Date;
  }[] = [];

  for (let weekNo = 1; weekNo <= totalWeeks; weekNo++) {
    const weekStart = addDays(termStartDate, (weekNo - 1) * 7);
    const weekEndCandidate = addDays(weekStart, 6);
    const weekEnd =
      weekEndCandidate > termEndDate ? termEndDate : weekEndCandidate;
    termWeeksData.push({
      termId: term.id,
      weekNo,
      startDate: weekStart,
      endDate: weekEnd,
    });
  }

  if (termWeeksData.length > 0) {
    await prisma.termWeek.createMany({ data: termWeeksData });
  }

  const lifeStageDefs = [
    {
      name: 'EARLY_STAGE',
      orderNo: 1,
      unlockInvestment: false,
      enableRandomExpense: false,
    },
    {
      name: 'MID_STAGE',
      orderNo: 2,
      unlockInvestment: false,
      enableRandomExpense: true,
    },
    {
      name: 'ADVANCED_STAGE',
      orderNo: 3,
      unlockInvestment: true,
      enableRandomExpense: true,
    },
  ];

  const lifeStages: {
    id: string;
    name: string;
    orderNo: number;
  }[] = [];

  for (const stage of lifeStageDefs) {
    const existing = await prisma.lifeStage.findFirst({
      where: { name: stage.name },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.lifeStage.update({
          where: { id: existing.id },
          data: {
            orderNo: stage.orderNo,
            unlockInvestment: stage.unlockInvestment,
            enableRandomExpense: stage.enableRandomExpense,
          },
        })
      : await prisma.lifeStage.create({ data: stage });

    lifeStages.push({ id: saved.id, name: saved.name, orderNo: saved.orderNo });
  }

  await prisma.termStageRule.deleteMany({ where: { termId: term.id } });

  const sortedStages = lifeStages.sort((a, b) => a.orderNo - b.orderNo);
  if (sortedStages.length > 0) {
    const chunk = Math.ceil(totalWeeks / sortedStages.length);
    let startWeek = 1;

    for (let index = 0; index < sortedStages.length; index++) {
      const stage = sortedStages[index];
      const isLast = index === sortedStages.length - 1;
      const endWeek = isLast
        ? totalWeeks
        : Math.min(totalWeeks, startWeek + chunk - 1);

      if (startWeek <= totalWeeks) {
        await prisma.termStageRule.create({
          data: {
            termId: term.id,
            lifeStageId: stage.id,
            startWeek,
            endWeek,
          },
        });
      }

      startWeek = endWeek + 1;
    }
  }

  const classroomName = 'Demo Classroom A';
  const classroom =
    (await prisma.classroom.findFirst({
      where: {
        termId: term.id,
        name: classroomName,
      },
    })) ??
    (await prisma.classroom.create({
      data: {
        name: classroomName,
        termId: term.id,
        teacherId: teacherUser.id,
      },
    }));

  await prisma.classroom.update({
    where: { id: classroom.id },
    data: {
      teacherId: teacherUser.id,
      termId: term.id,
      name: classroomName,
    },
  });

  await prisma.classroomStudent.upsert({
    where: {
      classroomId_studentId: {
        classroomId: classroom.id,
        studentId: studentUser.id,
      },
    },
    update: {},
    create: {
      classroomId: classroom.id,
      studentId: studentUser.id,
    },
  });

  const demoStudentProfile = await prisma.studentProfile.upsert({
    where: {
      userId_termId: {
        userId: studentUser.id,
        termId: term.id,
      },
    },
    update: {},
    create: {
      userId: studentUser.id,
      termId: term.id,
    },
  });

  await prisma.wallet.upsert({
    where: {
      studentProfileId: demoStudentProfile.id,
    },
    update: {},
    create: {
      studentProfileId: demoStudentProfile.id,
      balance: 50000,
    },
  });

  const learningModuleSeeds = [
    {
      title: 'Finance Basics',
      description: 'เงินออม ดอกเบี้ย และการวางแผนเบื้องต้น',
      contentUrl: 'https://example.com/modules/finance-basics',
      orderNo: 1,
      isActive: true,
    },
    {
      title: 'Investing Basics',
      description: 'รู้จักความเสี่ยงและผลตอบแทนของการลงทุน',
      contentUrl: 'https://example.com/modules/investing-basics',
      orderNo: 2,
      isActive: true,
    },
  ];

  for (const moduleSeed of learningModuleSeeds) {
    const existingModule = await prisma.learningModule.findFirst({
      where: {
        termId: term.id,
        title: moduleSeed.title,
      },
      select: { id: true },
    });

    if (existingModule) {
      await prisma.learningModule.update({
        where: { id: existingModule.id },
        data: {
          description: moduleSeed.description,
          contentUrl: moduleSeed.contentUrl,
          orderNo: moduleSeed.orderNo,
          isActive: moduleSeed.isActive,
        },
      });
    } else {
      await prisma.learningModule.create({
        data: {
          termId: term.id,
          title: moduleSeed.title,
          description: moduleSeed.description,
          contentUrl: moduleSeed.contentUrl,
          orderNo: moduleSeed.orderNo,
          isActive: moduleSeed.isActive,
        },
      });
    }
  }

  // 7. Seed Investment Market Demo (สำหรับกราฟราคา)
  console.log('📈 กำลังสร้างข้อมูล Investment Market demo...');

  const marketTermName = 'Demo Market Term 2026';
  const marketTermStart = new Date('2026-01-01T00:00:00.000Z');
  const marketTermEnd = new Date('2026-12-31T00:00:00.000Z');
  const marketTotalPoints = 365;

  const existingMarketTerm = await prisma.term.findFirst({
    where: {
      schoolId: school.id,
      name: marketTermName,
    },
    select: { id: true },
  });

  const marketTerm = existingMarketTerm
    ? await prisma.term.update({
        where: { id: existingMarketTerm.id },
        data: {
          schoolId: school.id,
          name: marketTermName,
          startDate: marketTermStart,
          endDate: marketTermEnd,
          totalWeeks: marketTotalPoints,
          status: TermStatus.ONGOING,
        },
      })
    : await prisma.term.create({
        data: {
          schoolId: school.id,
          name: marketTermName,
          startDate: marketTermStart,
          endDate: marketTermEnd,
          totalWeeks: marketTotalPoints,
          status: TermStatus.ONGOING,
        },
      });

  const marketStudentProfile = await prisma.studentProfile.upsert({
    where: {
      userId_termId: {
        userId: studentUser.id,
        termId: marketTerm.id,
      },
    },
    update: {},
    create: {
      userId: studentUser.id,
      termId: marketTerm.id,
    },
  });

  await prisma.wallet.upsert({
    where: {
      studentProfileId: marketStudentProfile.id,
    },
    update: {
      balance: 250000,
    },
    create: {
      studentProfileId: marketStudentProfile.id,
      balance: 250000,
    },
  });

  const productSeeds: {
    type: ProductType;
    symbol: string;
    name: string;
    riskLevel: RiskLevel;
    sector: string;
    isActive: boolean;
    simulation: {
      initialPrice: number;
      mu: number;
      sigma: number;
      dt: number;
    };
  }[] = [
    {
      type: ProductType.STOCK,
      symbol: 'CQTECH',
      name: 'CashQuest Tech Growth',
      riskLevel: RiskLevel.HIGH,
      sector: 'TECH',
      isActive: true,
      simulation: { initialPrice: 120, mu: 0.14, sigma: 0.33, dt: 1 / 365 },
    },
    {
      type: ProductType.FUND,
      symbol: 'CQBAL',
      name: 'CashQuest Balanced Fund',
      riskLevel: RiskLevel.MED,
      sector: 'MIXED',
      isActive: true,
      simulation: { initialPrice: 85, mu: 0.09, sigma: 0.18, dt: 1 / 365 },
    },
    {
      type: ProductType.BOND,
      symbol: 'CQBOND10',
      name: 'CashQuest Gov Bond 10Y',
      riskLevel: RiskLevel.LOW,
      sector: 'GOV',
      isActive: true,
      simulation: { initialPrice: 100, mu: 0.035, sigma: 0.06, dt: 1 / 365 },
    },
  ];

  const products: {
    id: string;
    symbol: string;
    simulation: {
      initialPrice: number;
      mu: number;
      sigma: number;
      dt: number;
    };
  }[] = [];

  for (const seed of productSeeds) {
    const product = await prisma.product.upsert({
      where: { symbol: seed.symbol },
      update: {
        type: seed.type,
        name: seed.name,
        riskLevel: seed.riskLevel,
        sector: seed.sector,
        isActive: seed.isActive,
        metaJson: {
          source: 'seed',
          market: 'demo',
          category: 'price-chart',
        } as Prisma.InputJsonValue,
      },
      create: {
        type: seed.type,
        symbol: seed.symbol,
        name: seed.name,
        riskLevel: seed.riskLevel,
        sector: seed.sector,
        isActive: seed.isActive,
        metaJson: {
          source: 'seed',
          market: 'demo',
          category: 'price-chart',
        } as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        symbol: true,
      },
    });

    await prisma.productSimulation.upsert({
      where: {
        termId_productId: {
          termId: marketTerm.id,
          productId: product.id,
        },
      },
      update: {
        initialPrice: seed.simulation.initialPrice,
        mu: seed.simulation.mu,
        sigma: seed.simulation.sigma,
        dt: seed.simulation.dt,
      },
      create: {
        termId: marketTerm.id,
        productId: product.id,
        initialPrice: seed.simulation.initialPrice,
        mu: seed.simulation.mu,
        sigma: seed.simulation.sigma,
        dt: seed.simulation.dt,
      },
    });

    products.push({
      id: product.id,
      symbol: product.symbol,
      simulation: seed.simulation,
    });
  }

  await prisma.termSimulation.upsert({
    where: { termId: marketTerm.id },
    update: {
      randomSeed: 20260301,
      currentWeek: 180,
      engineVersion: 'market-seed-v1',
    },
    create: {
      termId: marketTerm.id,
      randomSeed: 20260301,
      currentWeek: 180,
      engineVersion: 'market-seed-v1',
    },
  });

  const existingShockEvent = await prisma.economicEvent.findFirst({
    where: { title: 'FED Rate Hike Shock' },
    select: { id: true },
  });

  const shockEvent = existingShockEvent
    ? await prisma.economicEvent.update({
        where: { id: existingShockEvent.id },
        data: {
          eventType: EconomicEventType.VOLATILITY_SHOCK,
          defaultImpact: {
            sigmaAdjustment: 0.08,
            sigmaMultiplier: 1.25,
            muAdjustment: -0.03,
          } as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      })
    : await prisma.economicEvent.create({
        data: {
          title: 'FED Rate Hike Shock',
          description: 'อัตราดอกเบี้ยขึ้นเร็วกว่าคาด เพิ่มความผันผวนระยะสั้น',
          eventType: EconomicEventType.VOLATILITY_SHOCK,
          defaultImpact: {
            sigmaAdjustment: 0.08,
            sigmaMultiplier: 1.25,
            muAdjustment: -0.03,
          } as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      });

  const existingRallyEvent = await prisma.economicEvent.findFirst({
    where: { title: 'Tech Earnings Rally' },
    select: { id: true },
  });

  const rallyEvent = existingRallyEvent
    ? await prisma.economicEvent.update({
        where: { id: existingRallyEvent.id },
        data: {
          eventType: EconomicEventType.DRIFT_SHIFT,
          defaultImpact: {
            muAdjustment: 0.06,
            sigmaAdjustment: 0.01,
          } as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      })
    : await prisma.economicEvent.create({
        data: {
          title: 'Tech Earnings Rally',
          description: 'ผลประกอบการกลุ่มเทคออกมาดีกว่าคาด',
          eventType: EconomicEventType.DRIFT_SHIFT,
          defaultImpact: {
            muAdjustment: 0.06,
            sigmaAdjustment: 0.01,
          } as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      });

  await prisma.termEvent.deleteMany({ where: { termId: marketTerm.id } });
  await prisma.termEvent.createMany({
    data: [
      {
        termId: marketTerm.id,
        eventId: shockEvent.id,
        startWeek: 60,
        endWeek: 85,
        status: TermEventStatus.EXPIRED,
      },
      {
        termId: marketTerm.id,
        eventId: rallyEvent.id,
        startWeek: 150,
        endWeek: 210,
        status: TermEventStatus.ACTIVE,
      },
    ],
  });

  await prisma.marketRegime.deleteMany({ where: { termId: marketTerm.id } });
  await prisma.marketRegime.createMany({
    data: [
      {
        termId: marketTerm.id,
        name: MarketRegimeName.BULL,
        muAdjustment: 0.015,
        sigmaAdjustment: -0.01,
        startWeek: 1,
        endWeek: 120,
      },
      {
        termId: marketTerm.id,
        name: MarketRegimeName.BEAR,
        muAdjustment: -0.018,
        sigmaAdjustment: 0.025,
        startWeek: 121,
        endWeek: 220,
      },
      {
        termId: marketTerm.id,
        name: MarketRegimeName.SIDEWAYS,
        muAdjustment: 0.002,
        sigmaAdjustment: 0.005,
        startWeek: 221,
        endWeek: 365,
      },
    ],
  });

  const marketEvents = await prisma.termEvent.findMany({
    where: { termId: marketTerm.id },
    include: { event: true },
  });
  const marketRegimes = await prisma.marketRegime.findMany({
    where: { termId: marketTerm.id },
  });

  await prisma.productPrice.deleteMany({
    where: {
      termId: marketTerm.id,
      productId: { in: products.map((product) => product.id) },
    },
  });

  for (const product of products) {
    const rng = createSeededRng(20260301 + product.symbol.length * 97);
    let previousClose = product.simulation.initialPrice;

    const rows: {
      termId: string;
      productId: string;
      weekNo: number;
      open: number;
      high: number;
      low: number;
      close: number;
      returnPct: number;
      muUsed: number;
      sigmaUsed: number;
      eventId: string | null;
      generationType: PriceGenerationType;
      createdAt: Date;
    }[] = [];

    for (let point = 1; point <= marketTotalPoints; point++) {
      const activeRegime = marketRegimes.find(
        (regime) => regime.startWeek <= point && regime.endWeek >= point,
      );

      const activeEvent = marketEvents.find(
        (event) => event.startWeek <= point && event.endWeek >= point,
      );

      const eventImpact =
        (activeEvent?.customImpact as Record<string, unknown> | null) ??
        (activeEvent?.event.defaultImpact as Record<string, unknown> | null);

      const regimeMuAdj = activeRegime ? Number(activeRegime.muAdjustment) : 0;
      const regimeSigmaAdj = activeRegime
        ? Number(activeRegime.sigmaAdjustment)
        : 0;
      const eventMuAdj = eventImpact?.muAdjustment
        ? Number(eventImpact.muAdjustment)
        : 0;
      const eventSigmaAdj = eventImpact?.sigmaAdjustment
        ? Number(eventImpact.sigmaAdjustment)
        : 0;
      const sigmaMultiplier = eventImpact?.sigmaMultiplier
        ? Number(eventImpact.sigmaMultiplier)
        : 1;

      const mu = product.simulation.mu + regimeMuAdj + eventMuAdj;
      const sigma = Math.max(
        0.005,
        (product.simulation.sigma + regimeSigmaAdj + eventSigmaAdj) *
          sigmaMultiplier,
      );

      const z = gaussianFromRng(rng);
      const dt = product.simulation.dt;
      const drift = (mu - 0.5 * sigma * sigma) * dt;
      const diffusion = sigma * Math.sqrt(dt) * z;

      const open = previousClose;
      const close = Math.max(0.01, open * Math.exp(drift + diffusion));

      const wickNoise = Math.abs(gaussianFromRng(rng)) * 0.012;
      const high = Math.max(open, close) * (1 + wickNoise);
      const low = Math.max(0.01, Math.min(open, close) * (1 - wickNoise));

      rows.push({
        termId: marketTerm.id,
        productId: product.id,
        weekNo: point,
        open,
        high,
        low,
        close,
        returnPct: open === 0 ? 0 : (close - open) / open,
        muUsed: mu,
        sigmaUsed: sigma,
        eventId: activeEvent?.eventId ?? null,
        generationType: activeEvent
          ? PriceGenerationType.GBM_EVENT_ADJUSTED
          : PriceGenerationType.GBM,
        createdAt: addDays(marketTermStart, point - 1),
      });

      previousClose = close;
    }

    if (rows.length > 0) {
      await prisma.productPrice.createMany({ data: rows });
    }
  }

  console.log(`
✨ Seeding Completed!
📧 Admin Email: ${adminEmail}
🔑 Admin Pass: Admin@1234
📧 Teacher Email: teacher@school.com / Pass: Teacher@1234
📧 Student Email: student@school.com / Pass: Student@1234
📧 Staff Email: staff@school.com / Pass: Staff@1234
🏫 Demo School: ${demoSchoolName}
📚 Demo Term: ${termName}
📊 Market Term: ${marketTermName}
  `);

  const roleWithPermissions = await prisma.role.findMany({
    include: {
      rolePermissions: {
        // เข้าไปในตารางตัวกลาง (RolePermission)
        include: {
          permission: {
            select: {
              name: true,
            },
          }, // 👈 สำคัญ: ดึงข้อมูลจากตาราง Permission (ที่มีชื่อ) ออกมาด้วย
        },
      },
    },
  });

  // 2. แปลงโครงสร้างข้อมูลให้อ่านง่าย (Flatten)
  const prettyRoles = roleWithPermissions.map((role) => ({
    Role: role.name,
    Permissions: role.rolePermissions.map((rp) => rp.permission.name), // ดึงเฉพาะชื่อออกมา
  }));

  // 3. แสดงผล
  console.log(JSON.stringify(prettyRoles, null, 2));
}

// 4. การจัดการ Process และปิด Connection (สำคัญมากสำหรับ Driver Adapter)
main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end(); // ปิด Pool ของ pg เพื่อให้ Process จบการทำงานได้
  })
  .catch(async (e) => {
    console.error('❌ Seeding Error:', e);
    await prisma.$disconnect();
    await pool.end(); // ปิด Pool กรณี Error ด้วย ไม่งั้น process จะค้าง
    process.exit(1);
  });
