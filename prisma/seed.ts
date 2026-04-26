// 1. Load Environment Variables ทันที
import 'dotenv/config';

import {
  EconomicEventType,
  InvestmentTransactionType,
  MarketRegimeName,
  OrderSide,
  OrderStatus,
  OrderType,
  PriceGenerationType,
  Prisma,
  PrismaClient,
  QuestStatus,
  QuestSubmissionStatus,
  QuestSubmissionType,
  QuestType,
  QuizGradingType,
  QuizQuestionType,
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

  const toNumber = (value: unknown) => {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value);
  };

  const normalizeStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim().toUpperCase())
        .filter((item) => item.length > 0);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0);
    }

    return [];
  };

  const eventAppliesToProduct = (impact: unknown, sector?: string | null) => {
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) {
      return true;
    }

    const data = impact as Record<string, unknown>;
    const targetSectors = normalizeStringArray(
      data.targetSectors ?? data.sectors ?? data.targetSector,
    );
    const excludeSectors = normalizeStringArray(
      data.excludeSectors ?? data.excludedSectors,
    );

    if (!targetSectors.length && !excludeSectors.length) {
      return true;
    }

    const normalizedSector = (sector ?? '').trim().toUpperCase();
    if (!normalizedSector) {
      return false;
    }

    if (targetSectors.length && !targetSectors.includes(normalizedSector)) {
      return false;
    }

    if (excludeSectors.includes(normalizedSector)) {
      return false;
    }

    return true;
  };

  const applyImmediateEventShockForSeed = async (
    termId: string,
    termEventId: string,
  ) => {
    const weekNo =
      (
        await prisma.termSimulation.findUnique({
          where: { termId },
          select: { currentWeek: true },
        })
      )?.currentWeek ?? 1;

    const termEvent = await prisma.termEvent.findFirst({
      where: {
        id: termEventId,
        termId,
        status: TermEventStatus.ACTIVE,
      },
      include: { event: true },
    });

    if (!termEvent || termEvent.applyMode !== 'IMMEDIATE') {
      return 0;
    }

    if (termEvent.startWeek > weekNo || termEvent.endWeek < weekNo) {
      return 0;
    }

    const impact = termEvent.customImpact ?? termEvent.event.defaultImpact;
    const impactRecord =
      impact && typeof impact === 'object' && !Array.isArray(impact)
        ? (impact as Record<string, unknown>)
        : {};

    const shockPct =
      toNumber(impactRecord.instantShockPct) ||
      toNumber(impactRecord.immediateShockPct) ||
      toNumber(impactRecord.priceShockPct) ||
      toNumber(impactRecord.shockPct) ||
      0;

    if (shockPct === 0) {
      return 0;
    }

    const simulations = await prisma.productSimulation.findMany({
      where: { termId },
      include: {
        product: {
          select: {
            sector: true,
          },
        },
      },
    });

    let createdCount = 0;

    for (const sim of simulations) {
      if (!eventAppliesToProduct(impact, sim.product?.sector)) {
        continue;
      }

      const previousTick = await prisma.productLivePriceTick.findFirst({
        where: {
          termId,
          productId: sim.productId,
          simulatedWeekNo: weekNo,
        },
        orderBy: [{ tickedAt: 'desc' }],
      });

      const previousClosePrice = await prisma.productPrice.findFirst({
        where: {
          termId,
          productId: sim.productId,
          weekNo: { lte: weekNo },
        },
        orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
        select: { close: true },
      });

      const previousPrice = toNumber(
        previousTick?.price ?? previousClosePrice?.close ?? sim.initialPrice,
      );

      if (previousPrice <= 0) {
        continue;
      }

      const nextPrice = Math.max(0.0001, previousPrice * (1 + shockPct));
      const returnPct = (nextPrice - previousPrice) / previousPrice;

      await prisma.productLivePriceTick.create({
        data: {
          termId,
          productId: sim.productId,
          simulatedWeekNo: weekNo,
          price: nextPrice,
          returnPct,
          muUsed: sim.mu,
          sigmaUsed: sim.sigma,
          eventId: termEvent.eventId,
          generationType: PriceGenerationType.LIVE_TICK,
        },
      });

      createdCount += 1;
    }

    return createdCount;
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
    PERMISSIONS.SIMULATION.PLAY,
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
  const termStartDate = new Date('2026-03-09T00:00:00.000Z');
  const termEndDate = new Date('2026-06-28T00:00:00.000Z');
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
      name: 'วัยนักเรียน',
      orderNo: 1,
      unlockInvestment: false,
      enableRandomExpense: false,
    },
    {
      name: 'วัยนักศึกษา',
      orderNo: 2,
      unlockInvestment: true,
      enableRandomExpense: true,
    },
    {
      name: 'วัยทำงาน',
      orderNo: 3,
      unlockInvestment: true,
      enableRandomExpense: true,
    },
    {
      name: 'วัยเกษียณ',
      orderNo: 4,
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

  const classroomName = 'มัธยมศึกษาปีที่  6/4';
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

  const learningModules = await prisma.learningModule.findMany({
    where: {
      termId: term.id,
      title: {
        in: learningModuleSeeds.map((moduleSeed) => moduleSeed.title),
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  const moduleByTitle = new Map(
    learningModules.map((moduleItem) => [moduleItem.title, moduleItem.id]),
  );

  console.log('🧠 กำลัง seed Quiz สำหรับ flow แบบทดสอบ...');

  const financeModuleId = moduleByTitle.get('Finance Basics') ?? null;
  const quizSignatureQuestion =
    'ฝากเงิน 10,000 บาท อัตราดอกเบี้ย 5% ต่อปี แบบดอกเบี้ยทบต้น 2 ปี เมื่อครบ 2 ปี จะมีเงินประมาณเท่าไร?';

  const existingCompoundQuiz = await prisma.quiz.findFirst({
    where: {
      moduleId: financeModuleId,
      questions: {
        some: {
          questionText: quizSignatureQuestion,
        },
      },
    },
    select: { id: true },
  });

  const compoundInterestQuiz = existingCompoundQuiz
    ? await prisma.quiz.update({
        where: { id: existingCompoundQuiz.id },
        data: {
          moduleId: financeModuleId,
          timeLimitSec: 900,
          passAllRequired: false,
        },
        select: { id: true },
      })
    : await prisma.quiz.create({
        data: {
          moduleId: financeModuleId,
          timeLimitSec: 900,
          passAllRequired: false,
          questions: {
            create: [
              {
                questionText: quizSignatureQuestion,
                questionType: QuizQuestionType.SINGLE_CHOICE,
                gradingType: QuizGradingType.AUTO,
                orderNo: 1,
                points: 2,
                choices: {
                  create: [
                    { choiceText: '10,500 บาท', isCorrect: false, orderNo: 1 },
                    { choiceText: '11,000 บาท', isCorrect: false, orderNo: 2 },
                    { choiceText: '11,025 บาท', isCorrect: true, orderNo: 3 },
                    { choiceText: '11,500 บาท', isCorrect: false, orderNo: 4 },
                  ],
                },
              },
              {
                questionText:
                  'อธิบายสั้นๆ ว่าทำไมดอกเบี้ยทบต้นจึงช่วยให้เงินออมเติบโตเร็วขึ้น',
                questionType: QuizQuestionType.SHORT_TEXT,
                gradingType: QuizGradingType.MANUAL,
                orderNo: 2,
                points: 2,
              },
              {
                questionText:
                  'แนบไฟล์แผนการออมเงินของคุณ (รูปภาพหรือเอกสารก็ได้)',
                questionType: QuizQuestionType.FILE_UPLOAD,
                gradingType: QuizGradingType.MANUAL,
                orderNo: 3,
                points: 1,
              },
              {
                questionText:
                  'ดอกเบี้ยทบต้นคือการคิดดอกเบี้ยจากทั้งเงินต้นและดอกเบี้ยสะสมใช่หรือไม่',
                questionType: QuizQuestionType.TRUEFALSE,
                gradingType: QuizGradingType.AUTO,
                orderNo: 4,
                points: 1,
                choices: {
                  create: [
                    { choiceText: 'ใช่', isCorrect: true, orderNo: 1 },
                    { choiceText: 'ไม่ใช่', isCorrect: false, orderNo: 2 },
                  ],
                },
              },
            ],
          },
        },
        select: { id: true },
      });

  const quizQuestTitle = 'แบบทดสอบดอกเบี้ยทบต้น (Quiz)';
  const existingQuizQuest = await prisma.quest.findFirst({
    where: {
      termId: term.id,
      title: quizQuestTitle,
    },
    select: { id: true },
  });

  const quizQuest = existingQuizQuest
    ? await prisma.quest.update({
        where: { id: existingQuizQuest.id },
        data: {
          createdById: teacherUser.id,
          type: QuestType.QUIZ,
          title: quizQuestTitle,
          description:
            'เริ่มทำแบบทดสอบเพื่อไปหน้า Assignment Task และส่งคำตอบผ่านระบบจริง',
          rewardCoins: 350,
          status: QuestStatus.PUBLISHED,
          startAt: term.startDate,
          deadlineAt: addDays(term.startDate, 30),
          isSystem: false,
          submissionType: null,
          quizId: compoundInterestQuiz.id,
        },
        select: { id: true },
      })
    : await prisma.quest.create({
        data: {
          termId: term.id,
          createdById: teacherUser.id,
          type: QuestType.QUIZ,
          title: quizQuestTitle,
          description:
            'เริ่มทำแบบทดสอบเพื่อไปหน้า Assignment Task และส่งคำตอบผ่านระบบจริง',
          rewardCoins: 350,
          status: QuestStatus.PUBLISHED,
          startAt: term.startDate,
          deadlineAt: addDays(term.startDate, 30),
          isSystem: false,
          submissionType: null,
          quizId: compoundInterestQuiz.id,
        },
        select: { id: true },
      });

  await prisma.questClassroom.upsert({
    where: {
      questId_classroomId: {
        questId: quizQuest.id,
        classroomId: classroom.id,
      },
    },
    update: {},
    create: {
      questId: quizQuest.id,
      classroomId: classroom.id,
    },
  });

  console.log('🧭 กำลังสร้างระบบเควสแบบลำดับชั้น (System Quests)...');

  const quizDataMap: Record<
    string,
    Prisma.QuizQuestionCreateWithoutQuizInput[]
  > = {
    '1.2 ฝากเงินเข้าบัญชีออมทรัพย์': [
      {
        questionText:
          'การฝากเงินในบัญชีออมทรัพย์มีความเสี่ยงต่ำที่สุดเมื่อเทียบกับการลงทุนแบบอื่นใช่หรือไม่?',
        questionType: QuizQuestionType.TRUEFALSE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'ใช่', isCorrect: true, orderNo: 1 },
            { choiceText: 'ไม่ใช่', isCorrect: false, orderNo: 2 },
          ],
        },
      },
      {
        questionText: 'บัญชีออมทรัพย์เหมาะกับวัตถุประสงค์ใดมากที่สุด?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'สภาพคล่องและเงินสำรองฉุกเฉิน',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'เก็งกำไรระยะสั้น', isCorrect: false, orderNo: 2 },
            { choiceText: 'ลดหย่อนภาษี', isCorrect: false, orderNo: 3 },
          ],
        },
      },
    ],
    '1.3 ตั้งเป้าหมายการออม': [
      {
        questionText: 'หลักการตั้งเป้าหมายแบบ SMART ตัว S ย่อมาจากอะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'Specific (เฉพาะเจาะจง)',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'Simple (เรียบง่าย)', isCorrect: false, orderNo: 2 },
            { choiceText: 'Secure (ปลอดภัย)', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'เป้าหมายการออมใดถือเป็นเป้าหมายระยะสั้น?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'เก็บเงินซื้อโทรศัพท์มือถือใน 3 เดือน',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'เก็บเงินเพื่อเกษียณอายุ',
              isCorrect: false,
              orderNo: 2,
            },
            {
              choiceText: 'เก็บเงินซื้อบ้านใน 10 ปี',
              isCorrect: false,
              orderNo: 3,
            },
          ],
        },
      },
    ],
    '2.1 จดบันทึกรายจ่าย 7 วัน': [
      {
        questionText: 'ประโยชน์สำคัญที่สุดของการจดบันทึกรายจ่ายคืออะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ทำให้รู้ว่าเงินรั่วไหลไปกับสิ่งใดและนำไปปรับปรุงได้',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ทำให้รายได้เพิ่มขึ้น',
              isCorrect: false,
              orderNo: 2,
            },
            { choiceText: 'ลดภาษีได้', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'รายจ่ายใดคือรายจ่ายคงที่ (Fixed Expense)?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ค่าเช่าบ้าน / ค่าผ่อนบ้าน',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'ค่าอาหารประจำวัน', isCorrect: false, orderNo: 2 },
            {
              choiceText: 'ค่าดูหนังและสังสรรค์',
              isCorrect: false,
              orderNo: 3,
            },
          ],
        },
      },
    ],
    'จดบันทึกรายจ่าย 7 วัน': [
      {
        questionText: 'ประโยชน์สำคัญที่สุดของการจดบันทึกรายจ่ายคืออะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ทำให้รู้ว่าเงินรั่วไหลไปกับสิ่งใดและนำไปปรับปรุงได้',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ทำให้รายได้เพิ่มขึ้น',
              isCorrect: false,
              orderNo: 2,
            },
            { choiceText: 'ลดภาษีได้', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'รายจ่ายใดคือรายจ่ายคงที่ (Fixed Expense)?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ค่าเช่าบ้าน / ค่าผ่อนบ้าน',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'ค่าอาหารประจำวัน', isCorrect: false, orderNo: 2 },
            {
              choiceText: 'ค่าดูหนังและสังสรรค์',
              isCorrect: false,
              orderNo: 3,
            },
          ],
        },
      },
    ],
    '2.2 ตั้งงบประมาณรายเดือน': [
      {
        questionText: 'หลักการจัดสรรเงินแบบ 50/30/20 ตัวเลข 20 หมายถึงอะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'เงินออมและการลงทุน', isCorrect: true, orderNo: 1 },
            { choiceText: 'ความต้องการ (Wants)', isCorrect: false, orderNo: 2 },
            { choiceText: 'ความจำเป็น (Needs)', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'แนบไฟล์แผนงบประมาณของคุณ',
        questionType: QuizQuestionType.FILE_UPLOAD,
        gradingType: QuizGradingType.MANUAL,
        orderNo: 2,
        points: 5,
      },
    ],
    ตั้งงบประมาณรายเดือน: [
      {
        questionText: 'หลักการจัดสรรเงินแบบ 50/30/20 ตัวเลข 20 หมายถึงอะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'เงินออมและการลงทุน', isCorrect: true, orderNo: 1 },
            { choiceText: 'ความต้องการ (Wants)', isCorrect: false, orderNo: 2 },
            { choiceText: 'ความจำเป็น (Needs)', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'แนบไฟล์แผนงบประมาณของคุณ',
        questionType: QuizQuestionType.FILE_UPLOAD,
        gradingType: QuizGradingType.MANUAL,
        orderNo: 2,
        points: 5,
      },
    ],
    '2.3 วิเคราะห์รายจ่ายของตนเอง': [
      {
        questionText:
          'รายจ่ายใดที่สามารถลดได้ง่ายที่สุดเมื่อจำเป็นต้องประหยัด?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 10,
        choices: {
          create: [
            {
              choiceText: 'ค่ากาแฟและขนมขบเคี้ยวรายวัน',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ค่าเดินทางไปเรียน/ทำงาน',
              isCorrect: false,
              orderNo: 2,
            },
            {
              choiceText: 'ค่าผ่อนบ้าน / ค่าเช่าบ้าน',
              isCorrect: false,
              orderNo: 3,
            },
          ],
        },
      },
    ],
    '3.1 เปิดกระเป๋าลงทุน': [
      {
        questionText: 'ก่อนเริ่มลงทุน ควรมีสิ่งใดก่อนเป็นอันดับแรก?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 10,
        choices: {
          create: [
            { choiceText: 'เงินสำรองฉุกเฉิน', isCorrect: true, orderNo: 1 },
            { choiceText: 'บัตรเครดิต', isCorrect: false, orderNo: 2 },
            { choiceText: 'รถยนต์', isCorrect: false, orderNo: 3 },
          ],
        },
      },
    ],
    '3.2 ซื้อหุ้นตัวแรก': [
      {
        questionText:
          'การซื้อหุ้นคือการที่เราเป็นเจ้าของส่วนหนึ่งของบริษัทใช่หรือไม่?',
        questionType: QuizQuestionType.TRUEFALSE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'ใช่', isCorrect: true, orderNo: 1 },
            { choiceText: 'ไม่ใช่', isCorrect: false, orderNo: 2 },
          ],
        },
      },
      {
        questionText:
          'การกระจายความเสี่ยงในการลงทุน (Diversification) มีความหมายว่าอย่างไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText:
                'ไม่ใส่ไข่ทั้งหมดไว้ในตะกร้าใบเดียว (ลงทุนหลายสินทรัพย์)',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ซื้อหุ้นตัวเดียวให้ได้กำไรมากสุด',
              isCorrect: false,
              orderNo: 2,
            },
            {
              choiceText: 'หลีกเลี่ยงการลงทุนไปเลย',
              isCorrect: false,
              orderNo: 3,
            },
          ],
        },
      },
    ],
    '3.3 วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น': [
      {
        questionText: 'สินทรัพย์ใดมีความเสี่ยงสูงที่สุด?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'หุ้นสามัญ', isCorrect: true, orderNo: 1 },
            { choiceText: 'พันธบัตรรัฐบาล', isCorrect: false, orderNo: 2 },
            { choiceText: 'เงินฝากประจำ', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'ความเสี่ยงและผลตอบแทนมักจะแปรผันตามกันใช่หรือไม่?',
        questionType: QuizQuestionType.TRUEFALSE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ใช่ (High Risk, High Return)',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'ไม่ใช่', isCorrect: false, orderNo: 2 },
          ],
        },
      },
    ],
    วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น: [
      {
        questionText: 'สินทรัพย์ใดมีความเสี่ยงสูงที่สุด?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            { choiceText: 'หุ้นสามัญ', isCorrect: true, orderNo: 1 },
            { choiceText: 'พันธบัตรรัฐบาล', isCorrect: false, orderNo: 2 },
            { choiceText: 'เงินฝากประจำ', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText: 'ความเสี่ยงและผลตอบแทนมักจะแปรผันตามกันใช่หรือไม่?',
        questionType: QuizQuestionType.TRUEFALSE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            {
              choiceText: 'ใช่ (High Risk, High Return)',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'ไม่ใช่', isCorrect: false, orderNo: 2 },
          ],
        },
      },
    ],
    '4.1 ทำความเข้าใจเงินเฟ้อ': [
      {
        questionText: 'เงินเฟ้อหมายถึงอะไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 5,
        choices: {
          create: [
            {
              choiceText:
                'ภาวะที่ระดับราคาสินค้าโดยทั่วไปเพิ่มขึ้นอย่างต่อเนื่อง',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ภาวะที่เงินมีค่ามากขึ้น',
              isCorrect: false,
              orderNo: 2,
            },
            { choiceText: 'ภาวะที่ดอกเบี้ยลดลง', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      {
        questionText:
          'ถ้าเงินเฟ้ออยู่ที่ 3% ต่อปี และดอกเบี้ยเงินฝากอยู่ที่ 1% ผลตอบแทนที่แท้จริงจะเป็นอย่างไร?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 2,
        points: 5,
        choices: {
          create: [
            { choiceText: 'ติดลบ 2%', isCorrect: true, orderNo: 1 },
            { choiceText: 'บวก 2%', isCorrect: false, orderNo: 2 },
            { choiceText: 'บวก 4%', isCorrect: false, orderNo: 3 },
          ],
        },
      },
    ],
    '4.2 วางแผนเกษียณจำลอง': [
      {
        questionText: 'ควรเริ่มวางแผนเกษียณเมื่อใด?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 10,
        choices: {
          create: [
            {
              choiceText: 'ยิ่งเร็วยิ่งดี (ตั้งแต่วัยเริ่มทำงาน)',
              isCorrect: true,
              orderNo: 1,
            },
            { choiceText: 'อายุ 50 ปีขึ้นไป', isCorrect: false, orderNo: 2 },
            { choiceText: 'เมื่อใกล้เกษียณ', isCorrect: false, orderNo: 3 },
          ],
        },
      },
    ],
    เข้าใจดอกเบี้ยทบต้น: [
      {
        questionText: '"ดอกเบี้ยทบต้น" คืออะไร ให้อธิบายสั้นๆ',
        questionType: QuizQuestionType.SHORT_TEXT,
        gradingType: QuizGradingType.MANUAL,
        orderNo: 1,
        points: 10,
      },
    ],
    'Interactive ภารกิจจำลองการตัดสินใจทางการเงิน': [
      {
        questionText: 'การตัดสินใจทางการเงินที่ดีควรคำนึงถึงสิ่งใดเป็นหลัก?',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        gradingType: QuizGradingType.AUTO,
        orderNo: 1,
        points: 10,
        choices: {
          create: [
            {
              choiceText: 'ความคุ้มค่าและสอดคล้องกับเป้าหมาย',
              isCorrect: true,
              orderNo: 1,
            },
            {
              choiceText: 'ความชอบส่วนตัวหรือตามกระแส',
              isCorrect: false,
              orderNo: 2,
            },
            { choiceText: 'โฆษณาชวนเชื่อ', isCorrect: false, orderNo: 3 },
          ],
        },
      },
    ],
  };

  // Helper to upsert a quest and link it to the demo classroom
  const upsertQuest = async (params: {
    title: string;
    description?: string;
    content?: string;
    type: QuestType;
    submissionType?: QuestSubmissionType | null;
    quizId?: string | null;
    rewardCoins: number;
    difficulty?: string;
    startAt?: Date;
    deadlineAt?: Date;
    isSystem: boolean;
    status: QuestStatus;
    parentId?: string | null;
    orderNo?: number | null;
  }) => {
    const existing = await prisma.quest.findFirst({
      where: { termId: term.id, title: params.title },
      select: { id: true, quizId: true },
    });

    let finalQuizId = params.quizId;
    if (params.type === QuestType.QUIZ && !finalQuizId) {
      if (existing && existing.quizId) {
        finalQuizId = existing.quizId;
      } else {
        const questionsData = quizDataMap[params.title] || [
          {
            questionText: `คำถามทดสอบความเข้าใจสำหรับ: ${params.title}`,
            questionType: QuizQuestionType.SINGLE_CHOICE,
            gradingType: QuizGradingType.AUTO,
            orderNo: 1,
            points: 10,
            choices: {
              create: [
                {
                  choiceText: 'เข้าใจและพร้อมนำไปปรับใช้',
                  isCorrect: true,
                  orderNo: 1,
                },
                {
                  choiceText: 'ยังไม่ค่อยเข้าใจ',
                  isCorrect: false,
                  orderNo: 2,
                },
              ],
            },
          },
        ];

        const generatedQuiz = await prisma.quiz.create({
          data: {
            timeLimitSec: 900,
            passAllRequired: false,
            questions: {
              create: questionsData,
            },
          },
        });
        finalQuizId = generatedQuiz.id;
      }
    }

    const quest = existing
      ? await prisma.quest.update({
          where: { id: existing.id },
          data: {
            type: params.type,
            title: params.title,
            description: params.description ?? null,
            content: params.content ?? null,
            rewardCoins: params.rewardCoins,
            difficulty: (params.difficulty as any) ?? 'EASY',
            status: params.status,
            submissionType: params.submissionType ?? null,
            quizId: finalQuizId ?? null,
            startAt: params.startAt ?? null,
            deadlineAt: params.deadlineAt ?? null,
            isSystem: params.isSystem,
            parentId: params.parentId ?? null,
            orderNo: params.orderNo ?? null,
          },
          select: { id: true },
        })
      : await prisma.quest.create({
          data: {
            termId: term.id,
            createdById: teacherUser.id,
            type: params.type,
            title: params.title,
            description: params.description ?? null,
            content: params.content ?? null,
            rewardCoins: params.rewardCoins,
            difficulty: (params.difficulty as any) ?? 'EASY',
            status: params.status,
            submissionType: params.submissionType ?? null,
            quizId: finalQuizId ?? null,
            startAt: params.startAt ?? null,
            deadlineAt: params.deadlineAt ?? null,
            isSystem: params.isSystem,
            parentId: params.parentId ?? null,
            orderNo: params.orderNo ?? null,
          },
          select: { id: true },
        });

    await prisma.questClassroom.upsert({
      where: {
        questId_classroomId: {
          questId: quest.id,
          classroomId: classroom.id,
        },
      },
      update: {},
      create: {
        questId: quest.id,
        classroomId: classroom.id,
      },
    });

    return quest;
  };

  // ─── System Quest Topic 1: การออมเงิน ───
  const savingsTopic = await upsertQuest({
    title: '1. การออมเงิน',
    description: 'กลุ่มภารกิจเกี่ยวกับการออมเงินและความเข้าใจเรื่องดอกเบี้ย',
    type: QuestType.OTHER,
    rewardCoins: 0,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    orderNo: 1,
  });

  const savingsSub1 = await upsertQuest({
    title: '1.1 เปิดบัญชีออมทรัพย์ครั้งแรก',
    description:
      'ทำภารกิจเปิดบัญชีออมทรัพย์ครั้งแรกให้สำเร็จ (actionType: opensavingaccount)',
    content:
      'บัญชีออมทรัพย์ (Savings Account) คือ บัญชีธนาคารพื้นฐานที่ใช้สำหรับเก็บเงิน\n' +
      'และรับดอกเบี้ยจากธนาคารในอัตราที่ต่ำแต่มีความปลอดภัยสูง\n\n' +
      '📌 ทำไมต้องเปิดบัญชีออมทรัพย์?\n' +
      '- ปลอดภัยกว่าเก็บเงินสดไว้ที่บ้าน\n' +
      '- ได้รับดอกเบี้ย (แม้จะน้อย) แต่เงินจะเติบโตได้เอง\n' +
      '- ฝึกวินัยทางการเงินตั้งแต่ยังไม่มีรายได้มาก\n\n' +
      '💡 สิ่งที่ควรรู้ก่อนเปิดบัญชี\n' +
      '1. เปรียบเทียบอัตราดอกเบี้ยของแต่ละธนาคาร\n' +
      '2. ตรวจสอบค่าธรรมเนียมและเงื่อนไขการถอน\n' +
      '3. เลือกบัญชีที่เหมาะกับเป้าหมายของเรา',
    type: QuestType.INTERACTIVE,
    rewardCoins: 100,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    parentId: savingsTopic.id,
    orderNo: 1,
  });

  await upsertQuest({
    title: '1.2 ฝากเงินเข้าบัญชีออมทรัพย์',
    description: 'ฝากเงินเข้าบัญชีออมทรัพย์ขั้นต่ำ 1,000 บาท',
    content:
      'การฝากเงินเข้าบัญชีออมทรัพย์เป็นก้าวแรกของการสร้างวินัยทางการเงิน\n\n' +
      '🏦 ประเภทการฝากเงิน\n' +
      '- เงินฝากกระแสรายวัน: ถอนได้ทุกเมื่อ ดอกเบี้ยต่ำมาก (0.25-0.50%)\n' +
      '- เงินฝากออมทรัพย์: ถอนได้ตามเงื่อนไข ดอกเบี้ยปานกลาง (0.50-1.50%)\n' +
      '- เงินฝากประจำ: ฝากระยะเวลาตั้งแต่ 3 เดือนขึ้นไป ดอกเบี้ยสูงสุด\n\n' +
      '📊 ตัวอย่าง: ฝากเงิน 10,000 บาท ดอกเบี้ย 1.25% ต่อปี\n' +
      '→ ดอกเบี้ยที่ได้ = 10,000 × 0.0125 = 125 บาท/ปี\n\n' +
      '⚠️ ข้อควรระวัง\n' +
      '- ตรวจสอบจำนวนครั้งที่ถอนได้ในแต่ละเทอม\n' +
      '- การถอนเกินกำหนดอาจมีค่าปรับหรือสูญเสียดอกเบี้ย',
    type: QuestType.QUIZ,
    rewardCoins: 80,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    parentId: savingsTopic.id,
    orderNo: 2,
  });

  await upsertQuest({
    title: '1.3 ตั้งเป้าหมายการออม',
    description: 'ตั้งเป้าหมายการออมระยะสั้น (1 เดือน) และระยะยาว (6 เดือน)',
    content: `การตั้งเป้าหมายการออมที่ดีต้องใช้หลักการ SMART\n\n'
      '🎯 หลักการ SMART\n'
      'S - Specific (เฉพาะเจาะจง): ออมเพื่ออะไร? เช่น "ซื้อรองเท้าวิ่ง"\n'
      'M - Measurable (วัดผลได้): ต้องการเงินเท่าไร? เช่น "3,000 บาท"\n'
      'A - Achievable (ทำได้จริง): ออมเดือนละเท่าไร? เช่น "500 บาท/เดือน"\n'
      'R - Relevant (เกี่ยวข้อง): สอดคล้องกับความต้องการจริงหรือไม่?\n'
      'T - Time-bound (มีกำหนด): ภายในเวลาเท่าไร? เช่น "ภายใน 6 เดือน"\n\n'
      '📅 ตัวอย่างการตั้งเป้าหมาย\n'
      '- ระยะสั้น (1-3 เดือน): ซื้อหนังสือ 500 บาท\n'
      '- ระยะกลาง (3-6 เดือน): ซื้อรองเท้า 3,000 บาท\n'
      '- ระยะยาว (6-12 เดือน): ท่องเที่ยว 10,000 บาท\n\n'
      '💡 เคล็ดลับ: เริ่มจากเป้าหมายเล็กๆ ก่อน พอสำเร็จแล้วค่อยเพิ่ม!'`,
    type: QuestType.QUIZ,
    rewardCoins: 120,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: addDays(term.startDate, 30),
    parentId: savingsTopic.id,
    orderNo: 3,
  });

  // ─── System Quest Topic 2: การวางแผนงบประมาณ ───
  const budgetTopic = await upsertQuest({
    title: '2. การวางแผนงบประมาณ',
    description: 'กลุ่มภารกิจเกี่ยวกับการวางแผนรายรับรายจ่ายและการจัดการเงิน',
    type: QuestType.OTHER,
    rewardCoins: 0,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    orderNo: 2,
  });

  await upsertQuest({
    title: '2.1 จดบันทึกรายจ่าย 7 วัน',
    description:
      'บันทึกรายจ่ายประจำวันต่อเนื่อง 7 วัน พร้อมสรุปสิ่งที่ได้เรียนรู้',
    content:
      'การจดบันทึกรายจ่ายเป็นนิสัยพื้นฐานที่สำคัญที่สุดของการจัดการเงิน\n\n' +
      '📝 ทำไมต้องจดบันทึกรายจ่าย?\n' +
      '- รู้ว่าเงินของเราหายไปไหนบ้าง\n' +
      '- พบรายจ่ายที่ "ไม่จำเป็น" และลดได้\n' +
      '- วางแผนงบประมาณได้แม่นยำขึ้น\n\n' +
      '📊 ประเภทรายจ่าย\n' +
      '🟢 รายจ่ายคงที่ (Fixed Expenses)\n' +
      '   → ค่าเช่า, ค่าผ่อน, ค่าเน็ตรายเดือน\n' +
      '🟡 รายจ่ายผันแปร (Variable Expenses)\n' +
      '   → ค่าอาหาร, ค่าเดินทาง, ค่าซื้อของใช้\n' +
      '🔴 รายจ่ายฟุ่มเฟือย (Discretionary)\n' +
      '   → ค่าดูหนัง, ค่ากาแฟ, ช้อปปิ้ง\n\n' +
      '💡 เคล็ดลับ: จดทุกรายจ่ายไม่ว่าจะน้อยแค่ไหน!\n' +
      'เช่น น้ำหวาน 25 บาท × 30 วัน = 750 บาท/เดือน!',
    type: QuestType.QUIZ,
    rewardCoins: 150,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 7),
    deadlineAt: addDays(term.startDate, 35),
    parentId: budgetTopic.id,
    orderNo: 1,
  });

  await upsertQuest({
    title: '2.2 ตั้งงบประมาณรายเดือน',
    description:
      'วางแผนรายรับรายจ่าย 1 เดือน และส่งลิงก์ไฟล์แผนงบประมาณของตนเอง',
    content:
      'งบประมาณคือแผนการใช้เงินที่ช่วยให้เราควบคุมรายจ่ายได้\n\n' +
      '💰 หลักการจัดสรรเงินแบบ 50/30/20\n\n' +
      '50% → ความจำเป็น (Needs)\n' +
      '   - ค่าอาหาร, ค่าเดินทาง, ค่าเช่า, ค่าผ่อน\n\n' +
      '30% → ความต้องการ (Wants)\n' +
      '   - ค่าสันทนาการ, ช้อปปิ้ง, ท่องเที่ยว\n\n' +
      '20% → เงินออมและการลงทุน (Savings & Investing)\n' +
      '   - เงินสำรองฉุกเฉิน, เงินลงทุน\n\n' +
      '📊 ตัวอย่าง: รายได้เดือนละ 10,000 บาท\n' +
      '- ความจำเป็น: 5,000 บาท\n' +
      '- ความต้องการ: 3,000 บาท\n' +
      '- ออม/ลงทุน: 2,000 บาท\n\n' +
      '💡 เคล็ดลับ: "จ่ายตัวเองก่อน" = โอนเงินเข้าออมก่อนใช้จ่าย!',
    type: QuestType.QUIZ,
    rewardCoins: 200,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 3),
    deadlineAt: addDays(term.startDate, 28),
    parentId: budgetTopic.id,
    orderNo: 2,
  });

  await upsertQuest({
    title: '2.3 วิเคราะห์รายจ่ายของตนเอง',
    description: 'สรุปและวิเคราะห์รายจ่ายที่บันทึกมา พร้อมเสนอแนะการปรับปรุง',
    content:
      'การวิเคราะห์รายจ่ายคือขั้นตอนสำคัญหลังจากจดบันทึกมาแล้ว\n\n' +
      '🔍 วิธีวิเคราะห์รายจ่าย\n\n' +
      '1. จัดหมวดหมู่รายจ่าย\n' +
      '   → อาหาร, เดินทาง, สันทนาการ, การศึกษา, อื่นๆ\n\n' +
      '2. หาสัดส่วนของแต่ล���หมวด\n' +
      '   → อาหาร 40%, เดินทาง 15%, สันทนาการ 25%, ...\n\n' +
      '3. เปรียบเทียบกับหลัก 50/30/20\n' +
      '   → รายจ่ายความต้องการเกิน 30% ไหม?\n' +
      '   → เงินออมน้อยกว่า 20% ไหม?\n\n' +
      '4. หารายจ่ายที่ลดได้\n' +
      '   → กาแฟวันละแก้ว 25 บาท × 30 = 750 บาท/เดือน!\n\n' +
      '💡 เป้าหมาย: ปรับงบประมาณให้สมดุลและเพิ่มเงินออมได้มากขึ้น',
    type: QuestType.QUIZ,
    rewardCoins: 180,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 14),
    deadlineAt: addDays(term.startDate, 42),
    parentId: budgetTopic.id,
    orderNo: 3,
  });

  // ─── System Quest Topic 3: การลงทุนเบื้องต้น ───
  const investTopic = await upsertQuest({
    title: '3. การลงทุนเบื้องต้น',
    description: 'กลุ่มภารกิจเกี่ยวกับความเข้าใจพื้นฐานการลงทุนและความเสี่ยง',
    type: QuestType.OTHER,
    rewardCoins: 0,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    orderNo: 3,
  });

  await upsertQuest({
    title: '3.1 เปิดกระเป๋าลงทุน',
    description: 'ทำภารกิจเปิดกระเป๋าลงทุน (Investment Wallet) ให้สำเร็จ',
    content:
      'ก่อนเริ่มลงทุน ต้องเตรียมตัวให้พร้อมก่อน!\n\n' +
      '📋 สิ่งที่ต้องมีก่อนเริ่มลงทุน\n\n' +
      '1. เงินสำรองฉุกเฉิน 3-6 เดือน\n' +
      '   → ถ้ารายจ่ายเดือนละ 10,000 บาท\n' +
      '   → ต้องมีเงินสำรอง 30,000-60,000 บาท\n\n' +
      '2. ประกันสุขภาพ/อุบัติเหตุ\n' +
      '   → ป้องกันค่ารักษาพยาบาลก้อนใหญ่ที่กินเงินออม\n\n' +
      '3. ไม่มีหนี้ที่มีดอกเบี้ยสูง\n' +
      '   → หนี้บัตรเครดิตดอกเบี้ย 16-18% ต้องจัดการก่อน!\n\n' +
      '💼 กระเป๋าลงทุน (Investment Wallet) คืออะไร?\n' +
      'เป็นกระเป๋าแยกสำหรับเงินลงทุนโดยเฉพาะ\n' +
      'แยกจากกระเป๋าหลักเพื่อไม่ให้สับสน\n' +
      'สามารถโอนเงินเข้า-ออกได้ตามต้องการ',
    type: QuestType.QUIZ,
    rewardCoins: 100,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    parentId: investTopic.id,
    orderNo: 1,
  });

  await upsertQuest({
    title: '3.2 ซื้อหุ้นตัวแรก',
    description: 'ทำการซื้อหุ้นอย่างน้อย 1 หุ้นในตลาดจำลอง',
    content:
      'หุ้น (Stock) คือหลักทรัพย์ที่แสดงว่าเราเป็นเจ้าของส่วนหนึ่งของบริษัท\n\n' +
      '📈 ซื้อหุ้นคืออะไร?\n' +
      '- เมื่อซื้อหุ้น = เราเป็น "ผู้ถือหุ้น" = เป็นเจ้าของบริษัทส่วนหนึ่ง\n' +
      '- หากบริษัททำกำไร ราคาหุ้นจะขึ้น → เราขายได้กำไร\n' +
      '- หากบริษัทจ่ายเงินปันผล → เราได้เงินปันผล\n\n' +
      '⚠️ ความเสี่ยง\n' +
      '- ราคาหุ้นขึ้นลงทุกวัน อาจขาดทุนได้\n' +
      '- ไม่มีการรับประกันผลตอบแทน\n\n' +
      '🥚 หลัก "ไม่ใส่ไข่ทั้งหมดในตะกร้าใบเดียว"\n' +
      'การกระจายความเสี่ยง (Diversification) คือ\n' +
      '- ลงทุนหลายหุ้น หลายอุตสาหกรรม\n' +
      '- ลดโอกาสขาดทุนทั้งหมด\n' +
      '- เช่น ซื้อหุ้นเทคโนโลยี + หุ้นธนาคาร + หุ้นพลังงาน',
    type: QuestType.QUIZ,
    rewardCoins: 120,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    parentId: investTopic.id,
    orderNo: 2,
  });

  await upsertQuest({
    title: '3.3 วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น',
    description:
      'เลือกสินทรัพย์ 3 ประเภทและสรุประดับความเสี่ยงที่เหมาะกับตนเอง',
    content:
      'ความเสี่ยงและผลตอบแทนเป็นสิ่งที่แปรผันไปด้วยกันเสมอ\n\n' +
      '📊 ระดับความเสี่ยงของสินทรัพย์ต่างๆ\n\n' +
      '🟢 ความเสี่ยงต่ำ\n' +
      '   - เงินฝากธนาคาร (ดอกเบี้ย 0.5-2%)\n' +
      '   - พันธบัตรรัฐบาล (ผลตอบแทน 2-4%)\n' +
      '   - ตั๋วเงินคลัง\n\n' +
      '🟡 ความเสี่ยงปานกลาง\n' +
      '   - กองทุนรวมตราสารหนี้ (ผลตอบแทน 3-5%)\n' +
      '   - กองทุนผสม\n' +
      '   - หุ้นกลุ่มสาธารณูปโภค\n\n' +
      '🔴 ความเสี่ยงสูง\n' +
      '   - หุ้นสามัญ (ผลตอบแทน -50% ถึง +100%)\n' +
      '   - กองทุนหุ้น\n' +
      '   - คริปโทเคอร์เรนซี\n\n' +
      '💡 กฎทอด: High Risk = High Potential Return\n' +
      'ไม่มีการลงทุนใดที่ให้ผลตอบแทนสูงโดยไม่มีความเสี่ยง!',
    type: QuestType.QUIZ,
    rewardCoins: 220,
    difficulty: 'HARD',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 10),
    deadlineAt: addDays(term.startDate, 42),
    parentId: investTopic.id,
    orderNo: 3,
  });

  // ─── System Quest Topic 4: การวางแผนการเงินเพื่ออนาคต ───
  const futureTopic = await upsertQuest({
    title: '4. การวางแผนการเงินเพื่ออนาคต',
    description: 'กลุ่มภารกิจเกี่ยวกับการวางแผนการเงินระยะยาวและการเกษียณ',
    type: QuestType.OTHER,
    rewardCoins: 0,
    difficulty: 'EASY',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: term.startDate,
    deadlineAt: term.endDate,
    orderNo: 4,
  });

  await upsertQuest({
    title: '4.1 ทำความเข้าใจเงินเฟ้อ',
    description: 'ศึกษาและอธิบายผลกระทบของเงินเฟ้อที่มีต่อการออมและการลงทุน',
    content:
      'เงินเฟ้อ (Inflation) คือภาวะที่ระดับราคาสินค้าโดยทั่วไปเพิ่มขึ้นอย่างต่อเนื่อง\n\n' +
      '📈 เงินเฟ้อคืออะไร?\n' +
      '- วันนี้ข้าวกล่องละ 40 บาท → 10 ปีต่อมาอาจเป็น 55 บาท\n' +
      '- เงิน 100 บาทวันนี้ ซื้อของได้ไม่เท่าเงิน 100 บาทเมื่อ 5 ปีก่อน\n' +
      '- ค่าเงินลดลงเรื่อยๆ ตามเวลา\n\n' +
      '💰 ผลกระทบต่อการออม\n\n' +
      'ตัวอย่าง: เงินเฟ้อ 3% ต่อปี, ดอกเบี้ยเงินฝาก 1%\n' +
      '→ ผลตอบแทนที่แท้จริง = 1% - 3% = -2%\n' +
      '→ เงินออมของเรา "ซื้อของได้น้อยลง" ทุกปี!\n\n' +
      '🛡️ วิธีต่อสู้กับเงินเฟ้อ\n' +
      '1. ลงทุนในสินทรัพย์ที่ให้ผลตอบแทนสูงกว่าเงินเฟ้อ\n' +
      '2. ลงทุนในหุ้น กองทุน หรืออสังหาริมทรัพย์\n' +
      '3. อย่าเก็บเงินสดทิ้งไว้อย่างเดียว',
    type: QuestType.QUIZ,
    rewardCoins: 150,
    difficulty: 'MEDIUM',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 21),
    deadlineAt: addDays(term.startDate, 49),
    parentId: futureTopic.id,
    orderNo: 1,
  });

  await upsertQuest({
    title: '4.2 วางแผนเกษียณจำลอง',
    description: 'จำลองแผนการออมเพื่อเกษียณจากเงินเดือนที่กำหนด',
    content:
      'เงินเกษียณคือเงินที่ต้องสะสมไว้ใช้หลังหยุดทำงาน (อายุ 60 ปีขึ้นไป)\n\n' +
      '📊 คนไทยโดยเฉลี่ยมีชีวิตหลังเกษียณ ~25 ปี (300 เดือน)\n' +
      'ค่าใช้จ่ายเฉลี่ยของครัวเรือนไทย ≈ 21,144 บาท/เดือน\n\n' +
      '🧮 สูตรคำนวณ\n' +
      'เงินที่ต้องมีก่อนเกษียณ = ค่าใช้จ่าย/เดือน × 12 × จำนวนปีหลังเกษียณ\n\n' +
      'ตัวอย่าง: 21,144 × 12 × 25 = 6,343,200 บาท\n\n' +
      '😱 แต่ถ้าออมเดือนละ 2,000 บาท ตลอด 38 ปี\n' +
      '= 2,000 × 12 × 38 = เพียง 912,000 บาท !!!\n\n' +
      '→ ออมอย่างเดียวไม่พอ ต้องรู้จักลงทุนด้วย\n\n' +
      '💡 ถ้าลงทุนได้ผลตอบแทน 7% ต่อปี\n' +
      'ออมเดือนละ 2,000 บาท เป็นเวลา 38 ปี\n' +
      '= ประมาณ 4,800,000 บาท (จากดอกเบี้ยทบต้น!)\n\n' +
      '🎯 บทเรียน: ยิ่งเริ่มเร็ว ยิ่งได้ประโยชน์จากดอกเบี้ยทบต้นมาก!',
    type: QuestType.QUIZ,
    rewardCoins: 250,
    difficulty: 'HARD',
    isSystem: true,
    status: QuestStatus.PUBLISHED,
    startAt: addDays(term.startDate, 28),
    deadlineAt: addDays(term.startDate, 56),
    parentId: futureTopic.id,
    orderNo: 2,
  });

  console.log('✅ สร้าง System Quests แบบลำดับชั้นเสร็จสมบูรณ์');

  console.log('📝 กำลัง seed เควสเรียนรู้เพิ่มเติมสำหรับนักเรียน...');

  const questSeeds: {
    title: string;
    description: string;
    type: QuestType;
    quizId?: string | null;
    rewardCoins: number;
    startAt: Date;
    deadlineAt: Date;
    isSystem: boolean;
    status: QuestStatus;
  }[] = [
    {
      title: 'เข้าใจดอกเบี้ยทบต้น',
      description:
        'อธิบายตัวอย่างการออมเงิน 12 เดือน พร้อมคำนวณดอกเบี้ยทบต้นแบบสั้นๆ',
      type: QuestType.QUIZ,
      rewardCoins: 300,
      startAt: term.startDate,
      deadlineAt: addDays(term.startDate, 21),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'ตั้งงบประมาณรายเดือน',
      description:
        'วางแผนรายรับรายจ่าย 1 เดือน และส่งลิงก์ไฟล์แผนงบประมาณของตนเอง',
      type: QuestType.QUIZ,
      rewardCoins: 250,
      startAt: addDays(term.startDate, 3),
      deadlineAt: addDays(term.startDate, 28),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'จดบันทึกรายจ่าย 7 วัน',
      description:
        'บันทึกรายจ่ายประจำวันต่อเนื่อง 7 วัน พร้อมสรุปสิ่งที่ได้เรียนรู้',
      type: QuestType.QUIZ,
      rewardCoins: 200,
      startAt: addDays(term.startDate, 7),
      deadlineAt: addDays(term.startDate, 35),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น',
      description:
        'เลือกสินทรัพย์ 3 ประเภทและสรุประดับความเสี่ยงที่เหมาะกับตนเอง',
      type: QuestType.QUIZ,
      rewardCoins: 220,
      startAt: addDays(term.startDate, 10),
      deadlineAt: addDays(term.startDate, 42),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'Interactive ภารกิจจำลองการตัดสินใจทางการเงิน',
      description:
        'ภารกิจโต้ตอบที่คุณครูสร้างเองสำหรับให้นักเรียนทำกิจกรรมในระบบ',
      type: QuestType.QUIZ,
      rewardCoins: 280,
      startAt: addDays(term.startDate, 5),
      deadlineAt: addDays(term.startDate, 33),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
  ];

  for (const questSeed of questSeeds) {
    await upsertQuest({
      title: questSeed.title,
      description: questSeed.description,
      type: questSeed.type,
      quizId: questSeed.quizId,
      rewardCoins: questSeed.rewardCoins,
      startAt: questSeed.startAt,
      deadlineAt: questSeed.deadlineAt,
      isSystem: questSeed.isSystem,
      status: questSeed.status,
    });
  }

  const pendingQuest = await prisma.quest.findFirst({
    where: {
      termId: term.id,
      title: 'เข้าใจดอกเบี้ยทบต้น',
    },
    select: { id: true },
  });

  if (pendingQuest) {
    await prisma.questSubmission.upsert({
      where: {
        questId_studentProfileId: {
          questId: pendingQuest.id,
          studentProfileId: demoStudentProfile.id,
        },
      },
      update: {
        status: QuestSubmissionStatus.PENDING,
      },
      create: {
        questId: pendingQuest.id,
        studentProfileId: demoStudentProfile.id,
        status: QuestSubmissionStatus.PENDING,
        latestVersionNo: 1,
      },
    });
  }

  console.log('🏦 กำลังสร้างข้อมูลธนาคารสำหรับเทอมหลัก...');

  const bankSeeds = [
    {
      name: 'ธนาคารยินดี',
      savingsConfig: {
        interestRate: 0.0075,
      },
      fdConfig: {
        interestRate: 0.0175,
        fixedDepositWeeks: 3,
        principal: 500,
      },
    },
    {
      name: 'ธนาควรพอใจ',
      savingsConfig: {
        interestRate: 0.01,
      },
      fdConfig: {
        interestRate: 0.02,
        fixedDepositWeeks: 6,
        principal: 500,
      },
    },
    {
      name: 'ธนาคารใจเย็น',
      savingsConfig: {
        interestRate: 0.0125,
      },
      fdConfig: {
        interestRate: 0.03,
        fixedDepositWeeks: 9,
        principal: 500,
      },
    },
  ];

  for (const bankSeed of bankSeeds) {
    let bankId: string;

    const existingBank = await prisma.bank.findFirst({
      where: {
        termId: term.id,
        name: bankSeed.name,
      },
      select: { id: true },
    });

    if (existingBank) {
      bankId = existingBank.id;
      await prisma.bank.update({
        where: { id: bankId },
        data: {
          name: bankSeed.name,
        },
      });
    } else {
      const bank = await prisma.bank.create({
        data: {
          termId: term.id,
          name: bankSeed.name,
        },
      });
      bankId = bank.id;
    }

    // Create/update savings account bank config
    if (bankSeed.savingsConfig) {
      const existingSA = await prisma.savingsAccountBank.findFirst({
        where: { bankId },
      });
      if (existingSA) {
        await prisma.savingsAccountBank.update({
          where: { id: existingSA.id },
          data: {
            interestRate: bankSeed.savingsConfig.interestRate,
            withdrawLimitPerTerm: bankSeed.savingsConfig.withdrawLimitPerTerm,
            feePerTransaction: bankSeed.savingsConfig.feePerTransaction,
          },
        });
      } else {
        await prisma.savingsAccountBank.create({
          data: {
            bankId,
            interestRate: bankSeed.savingsConfig.interestRate,
            withdrawLimitPerTerm: bankSeed.savingsConfig.withdrawLimitPerTerm,
            feePerTransaction: bankSeed.savingsConfig.feePerTransaction,
          },
        });
      }
    }

    // Create/update fixed deposit bank config
    if (bankSeed.fdConfig) {
      const existingFD = await prisma.fixedDepositBank.findFirst({
        where: { bankId },
      });
      if (existingFD) {
        await prisma.fixedDepositBank.update({
          where: { id: existingFD.id },
          data: {
            interestRate: bankSeed.fdConfig.interestRate,
            fixedDepositWeeks: bankSeed.fdConfig.fixedDepositWeeks,
            principal: bankSeed.fdConfig.principal,
          },
        });
      } else {
        await prisma.fixedDepositBank.create({
          data: {
            bankId,
            interestRate: bankSeed.fdConfig.interestRate,
            fixedDepositWeeks: bankSeed.fdConfig.fixedDepositWeeks,
            principal: bankSeed.fdConfig.principal,
          },
        });
      }
    }
  }

  console.log('🏅 กำลังสร้างข้อมูล badges สำหรับเทอมหลัก...');

  const badgeSeeds = [
    {
      code: 'FIRST_LOGIN',
      name: 'หมีเรื่องแน่',
      description: 'เข้าใช้งานครั้งแรกสำเร็จ',
      ruleJson: {
        type: 'event',
        event: 'LOGIN_FIRST_TIME',
      },
      earnedByDemoStudent: true,
    },
    {
      code: 'QUIZ_BEGINNER',
      name: 'หมีไหลป่าว',
      description: 'ทำแบบทดสอบผ่านอย่างน้อย 1 ครั้ง',
      ruleJson: {
        type: 'threshold',
        event: 'QUIZ_PASSED_COUNT',
        value: 1,
      },
      earnedByDemoStudent: false,
    },
    {
      code: 'FIRST_SAVE',
      name: 'หมีตื่นเช้า',
      description: 'เปิดบัญชีออมทรัพย์ครั้งแรก',
      ruleJson: {
        type: 'event',
        event: 'OPEN_SAVINGS_ACCOUNT',
      },
      earnedByDemoStudent: false,
    },
    {
      code: 'SAVER_LEVEL_1',
      name: 'หมีคนเส๋า',
      description: 'สะสมเงินออมรวมครบ 10,000',
      ruleJson: {
        type: 'threshold',
        event: 'TOTAL_SAVINGS',
        value: 10000,
      },
      earnedByDemoStudent: true,
    },
  ];

  for (const badgeSeed of badgeSeeds) {
    const badge = await prisma.badge.upsert({
      where: {
        termId_code: {
          termId: term.id,
          code: badgeSeed.code,
        },
      },
      update: {
        name: badgeSeed.name,
        description: badgeSeed.description,
        ruleJson: badgeSeed.ruleJson as Prisma.InputJsonValue,
      },
      create: {
        termId: term.id,
        code: badgeSeed.code,
        name: badgeSeed.name,
        description: badgeSeed.description,
        ruleJson: badgeSeed.ruleJson as Prisma.InputJsonValue,
      },
    });

    if (badgeSeed.earnedByDemoStudent) {
      await prisma.studentBadge.upsert({
        where: {
          studentProfileId_badgeId: {
            studentProfileId: demoStudentProfile.id,
            badgeId: badge.id,
          },
        },
        update: {
          earnedAt: new Date(),
        },
        create: {
          studentProfileId: demoStudentProfile.id,
          badgeId: badge.id,
          earnedAt: new Date(),
        },
      });
    }
  }

  console.log('📈 กำลังสร้างข้อมูล market สำหรับเทอมหลักเดียวกัน...');

  const marketTotalPoints = Math.max(term.totalWeeks, 12);

  await prisma.wallet.update({
    where: { studentProfileId: demoStudentProfile.id },
    data: { balance: 250000 },
  });

  const productSeeds: {
    type: ProductType;
    symbol: string;
    name: string;
    riskLevel: RiskLevel;
    sector: string;
    isActive: boolean;
    isDividendEnabled: boolean;
    dividendYieldAnnual?: number;
    dividendPayoutIntervalWeeks?: number;
    fixedDividendPerUnit?: number;
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
      name: 'CashQuest Hyper Growth',
      riskLevel: RiskLevel.HIGH,
      sector: 'TECH',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 120, mu: 0.14, sigma: 0.33, dt: 1 / 52 },
    },
    {
      type: ProductType.STOCK,
      symbol: 'CQGROW',
      name: 'CashQuest Growth Select',
      riskLevel: RiskLevel.MED,
      sector: 'CONSUMER',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 95, mu: 0.1, sigma: 0.2, dt: 1 / 52 },
    },
    {
      type: ProductType.STOCK,
      symbol: 'CQDIV',
      name: 'CashQuest Dividend Shield',
      riskLevel: RiskLevel.LOW,
      sector: 'UTILITY',
      isActive: true,
      isDividendEnabled: true,
      dividendYieldAnnual: 0.055,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 102, mu: 0.055, sigma: 0.1, dt: 1 / 52 },
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
        isDividendEnabled: seed.isDividendEnabled,
        dividendYieldAnnual: seed.dividendYieldAnnual,
        dividendPayoutIntervalWeeks: seed.dividendPayoutIntervalWeeks ?? 4,
        fixedDividendPerUnit: seed.fixedDividendPerUnit,
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
        isDividendEnabled: seed.isDividendEnabled,
        dividendYieldAnnual: seed.dividendYieldAnnual,
        dividendPayoutIntervalWeeks: seed.dividendPayoutIntervalWeeks ?? 4,
        fixedDividendPerUnit: seed.fixedDividendPerUnit,
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
          termId: term.id,
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
        termId: term.id,
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
    where: { termId: term.id },
    update: {
      randomSeed: 20260301,
      currentWeek: Math.min(6, term.totalWeeks),
      engineVersion: 'market-seed-v1',
    },
    create: {
      termId: term.id,
      randomSeed: 20260301,
      currentWeek: Math.min(6, term.totalWeeks),
      engineVersion: 'market-seed-v1',
    },
  });

  const currentMarketWeek = Math.min(6, term.totalWeeks);

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
          tags: ['ดอกเบี้ย', 'ความผันผวน'] as Prisma.InputJsonValue,
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
          tags: ['ดอกเบี้ย', 'ความผันผวน'] as Prisma.InputJsonValue,
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
          tags: ['เทคโนโลยี', 'ผลประกอบการ'] as Prisma.InputJsonValue,
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
          tags: ['เทคโนโลยี', 'ผลประกอบการ'] as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      });

  const existingFlashCrashEvent = await prisma.economicEvent.findFirst({
    where: { title: 'Flash Crash Breaking News' },
    select: { id: true },
  });

  const flashCrashEvent = existingFlashCrashEvent
    ? await prisma.economicEvent.update({
        where: { id: existingFlashCrashEvent.id },
        data: {
          eventType: EconomicEventType.MARKET_CRASH,
          defaultImpact: {
            muAdjustment: -0.25,
            sigmaAdjustment: 0.2,
            sigmaMultiplier: 1.5,
            instantShockPct: -0.16,
            targetSectors: ['TECH', 'CONSUMER'],
          } as Prisma.InputJsonValue,
          tags: [
            'ข่าวด่วน',
            'ผลกระทบ',
            'หุ้นกลุ่มเทคโนโลยี',
          ] as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      })
    : await prisma.economicEvent.create({
        data: {
          title: 'Flash Crash Breaking News',
          description:
            'ข่าวด่วนตลาดผันผวนรุนแรง ทำให้ราคากลุ่มเสี่ยงปรับลงทันที',
          eventType: EconomicEventType.MARKET_CRASH,
          defaultImpact: {
            muAdjustment: -0.25,
            sigmaAdjustment: 0.2,
            sigmaMultiplier: 1.5,
            instantShockPct: -0.16,
            targetSectors: ['TECH', 'CONSUMER'],
          } as Prisma.InputJsonValue,
          tags: [
            'ข่าวด่วน',
            'ผลกระทบ',
            'หุ้นกลุ่มเทคโนโลยี',
          ] as Prisma.InputJsonValue,
          isRepeatable: true,
        },
      });

  await prisma.termEvent.deleteMany({ where: { termId: term.id } });

  console.log('🎲 กำลังสร้าง 16 economic events และ randomize assignments...');

  // Define 16 economic event configurations
  const economicEventConfigs = [
    {
      title: 'FED Rate Hike Shock',
      description: 'อัตราดอกเบี้ยขึ้นเร็วกว่าคาด เพิ่มความผันผวนระยะสั้น',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        sigmaAdjustment: 0.08,
        sigmaMultiplier: 1.25,
        muAdjustment: -0.03,
      },
      tags: ['ดอกเบี้ย', 'ความผันผวน'],
    },
    {
      title: 'Tech Earnings Rally',
      description: 'ผลประกอบการกลุ่มเทคออกมาดีกว่าคาด',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.06,
        sigmaAdjustment: 0.01,
      },
      tags: ['เทคโนโลยี', 'ผลประกอบการ'],
    },
    {
      title: 'Flash Crash Breaking News',
      description: 'ข่าวด่วนตลาดผันผวนรุนแรง ทำให้ราคากลุ่มเสี่ยงปรับลงทันที',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.25,
        sigmaAdjustment: 0.2,
        sigmaMultiplier: 1.5,
        instantShockPct: -0.16,
        targetSectors: ['TECH', 'CONSUMER'],
      },
      tags: ['ข่าวด่วน', 'ผลกระทบ', 'หุ้นกลุ่มเทคโนโลยี'],
    },
    {
      title: 'Oil Price Surge',
      description: 'ราคาน้ำมันพุ่งขึ้นจากสถานการณ์ภูมิรัฐศาสตร์',
      eventType: EconomicEventType.SECTOR_SPECIFIC,
      defaultImpact: {
        muAdjustment: -0.04,
        sigmaAdjustment: 0.12,
        targetSectors: ['ENERGY', 'TRANSPORT'],
      },
      tags: ['พลังงาน', 'ขนส่ง', 'ภูมิรัฐศาสตร์'],
    },
    {
      title: 'Earnings Beat Surprise',
      description: 'บริษัทใหญ่หลายแห่งรายงานผลกำไรสูงกว่าคาด',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.08,
        sigmaAdjustment: 0.02,
      },
      tags: ['ผลประกอบการ', 'หุ้นกลุ่มบริโภค'],
    },
    {
      title: 'Inflation Data Release',
      description: 'ข้อมูลเงินเฟ้อสูงกว่าที่คาดการณ์',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        sigmaAdjustment: 0.06,
        muAdjustment: -0.02,
      },
      tags: ['เงินเฟ้อ', 'ข้อมูลเศรษฐกิจ'],
    },
    {
      title: 'Corporate Scandal',
      description: 'บริษัทใหญ่เผชิญกับวิกฤตความเชื่อมั่น',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.12,
        sigmaAdjustment: 0.08,
      },
      tags: ['วิกฤตความเชื่อมั่น'],
    },
    {
      title: 'Interest Rate Cut',
      description: 'ธนาคารกลางลดอัตราดอกเบี้ยเพื่อเร้าเศรษฐกิจ',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.05,
        sigmaAdjustment: -0.01,
      },
      tags: ['ดอกเบี้ย', 'เศรษฐกิจมหภาค'],
    },
    {
      title: 'Stock Market Correction',
      description: 'ตลาดหุ้นปรับตัวปกติหลังการขึ้นราคาอย่างรวดเร็ว',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        muAdjustment: -0.05,
        sigmaAdjustment: 0.05,
      },
      tags: ['ตลาดหุ้น', 'การปรับตัว'],
    },
    {
      title: 'GDP Growth Announcement',
      description: 'รายงานการเติบโตทางเศรษฐกิจมีสัญญาณบวก',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.07,
        sigmaAdjustment: 0.01,
      },
      tags: ['เศรษฐกิจมหภาค', 'GDP'],
    },
    {
      title: 'Tech Buyout Frenzy',
      description: 'รอบการซื้อกิจการบริษัทเทคโนโลยี',
      eventType: EconomicEventType.SECTOR_SPECIFIC,
      defaultImpact: {
        muAdjustment: 0.09,
        targetSectors: ['TECH'],
      },
      tags: ['เทคโนโลยี', 'การซื้อกิจการ'],
    },
    {
      title: 'Unemployment Report Surge',
      description: 'อัตราการว่างงานเพิ่มขึ้นอย่างไม่คาดคิด',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.08,
        sigmaAdjustment: 0.07,
      },
      tags: ['ตลาดแรงงาน', 'เศรษฐกิจมหภาค'],
    },
    {
      title: 'Retail Sales Boom',
      description: 'ยอดขายปลีกเพิ่มขึ้นสะท้อนความเชื่อมั่นผู้บริโภค',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.06,
        targetSectors: ['CONSUMER', 'RETAIL'],
      },
      tags: ['หุ้นกลุ่มบริโภค', 'ยอดขายปลีก'],
    },
    {
      title: 'Fed Minutes Release',
      description: 'นาทีการประชุมของธนาคารกลางเปิดเผยมุมมองการนโยบายการเงิน',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        sigmaAdjustment: 0.04,
      },
      tags: ['ธนาคารกลาง', 'นโยบายการเงิน'],
    },
    {
      title: 'Trade War Escalation',
      description: 'ความตึงเณรรายศาสตร์การค้าระหว่างประเทศเพิ่มขึ้น',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.1,
        sigmaAdjustment: 0.1,
      },
      tags: ['การค้าระหว่างประเทศ', 'ภูมิรัฐศาสตร์'],
    },
    {
      title: 'Housing Data Positive',
      description: 'ข้อมูลตัวอักษรบ้านและที่ดินออกมาแข็งแกร่ง',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.04,
        targetSectors: ['REAL_ESTATE', 'CONSTRUCTION'],
      },
      tags: ['อสังหาริมทรัพย์', 'ก่อสร้าง'],
    },
    {
      title: 'Fed Balance Sheet Shift',
      description: 'การเปลี่ยนแปลงนโยบายการดำเนินการด้านความสมดุลของธนาคารกลาง',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.03,
        sigmaAdjustment: -0.02,
      },
      tags: ['ธนาคารกลาง', 'นโยบายการเงิน'],
    },
  ];

  // Create or find all economic events
  const allEvents: Array<{ id: string }> = [];
  for (const config of economicEventConfigs) {
    const existing = await prisma.economicEvent.findFirst({
      where: { title: config.title },
      select: { id: true },
    });

    const event = existing
      ? await prisma.economicEvent.update({
          where: { id: existing.id },
          data: {
            eventType: config.eventType,
            defaultImpact: config.defaultImpact as Prisma.InputJsonValue,
            tags: config.tags
              ? (config.tags as Prisma.InputJsonValue)
              : undefined,
            isRepeatable: true,
          },
          select: { id: true },
        })
      : await prisma.economicEvent.create({
          data: {
            title: config.title,
            description: config.description,
            eventType: config.eventType,
            defaultImpact: config.defaultImpact as Prisma.InputJsonValue,
            tags: config.tags
              ? (config.tags as Prisma.InputJsonValue)
              : undefined,
            isRepeatable: true,
          },
          select: { id: true },
        });

    allEvents.push(event);
  }

  // Shuffle events randomly for this term (Fisher-Yates)
  const shuffledEvents = [...allEvents];
  for (let i = shuffledEvents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledEvents[i], shuffledEvents[j]] = [
      shuffledEvents[j],
      shuffledEvents[i],
    ];
  }

  // Assign events to weeks 1-16
  const termTotalWeeks = Math.min(16, term.totalWeeks);
  const eventWeekStart = Math.max(1, currentMarketWeek);

  for (let week = 1; week <= termTotalWeeks; week++) {
    if (shuffledEvents[week - 1]) {
      // Determine status based on current week
      let status: TermEventStatus = TermEventStatus.SCHEDULED;
      if (week < eventWeekStart) {
        status = TermEventStatus.EXPIRED;
      } else if (week === eventWeekStart) {
        status = TermEventStatus.ANNOUNCED;
      } else if (week === eventWeekStart + 1) {
        status = TermEventStatus.ACTIVE;
      }

      await prisma.termEvent.create({
        data: {
          termId: term.id,
          eventId: shuffledEvents[week - 1].id,
          startWeek: week,
          endWeek: week,
          applyMode: 'NEXT_TICK',
          status,
        },
      });
    }
  }

  console.log(
    `✅ สร้างเหตุการณ์ 16 อย่างและกำหนดให้กับสัปดาห์ 1-${termTotalWeeks}`,
  );

  await prisma.marketRegime.deleteMany({ where: { termId: term.id } });

  const split1 = Math.max(2, Math.floor(marketTotalPoints / 3));
  const split2 = Math.max(split1 + 1, Math.floor((marketTotalPoints * 2) / 3));

  await prisma.marketRegime.createMany({
    data: [
      {
        termId: term.id,
        name: MarketRegimeName.BULL,
        muAdjustment: 0.015,
        sigmaAdjustment: -0.01,
        startWeek: 1,
        endWeek: split1,
      },
      {
        termId: term.id,
        name: MarketRegimeName.BEAR,
        muAdjustment: -0.018,
        sigmaAdjustment: 0.025,
        startWeek: split1 + 1,
        endWeek: split2,
      },
      {
        termId: term.id,
        name: MarketRegimeName.SIDEWAYS,
        muAdjustment: 0.002,
        sigmaAdjustment: 0.005,
        startWeek: split2 + 1,
        endWeek: marketTotalPoints,
      },
    ],
  });

  const marketEvents = await prisma.termEvent.findMany({
    where: { termId: term.id },
    include: { event: true },
  });

  const marketRegimes = await prisma.marketRegime.findMany({
    where: { termId: term.id },
  });

  await prisma.productPrice.deleteMany({
    where: {
      termId: term.id,
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
        termId: term.id,
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
        createdAt: addDays(term.startDate, point - 1),
      });

      previousClose = close;
    }

    if (rows.length > 0) {
      await prisma.productPrice.createMany({ data: rows });
    }
  }

  console.log('👥 กำลัง seed ผู้เล่นตลาดเพิ่มเติมสำหรับทีม...');

  const latestPriceRows = await prisma.productPrice.findMany({
    where: {
      termId: term.id,
      productId: { in: products.map((product) => product.id) },
    },
    orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
  });

  const latestPriceByProductId = new Map<string, number>();
  for (const row of latestPriceRows) {
    if (!latestPriceByProductId.has(row.productId)) {
      latestPriceByProductId.set(row.productId, Number(row.close));
    }
  }

  const productBySymbol = new Map(
    products.map((product) => [product.symbol, product]),
  );

  const marketStudentSeeds: {
    email: string;
    username: string;
    mainWalletBalance: number;
    investmentCash: number;
    holdings: Array<{ symbol: string; units: number; avgCost: number }>;
  }[] = [
    {
      email: 'student@school.com',
      username: 'student_demo',
      mainWalletBalance: 250000,
      investmentCash: 90000,
      holdings: [
        { symbol: 'CQTECH', units: 180, avgCost: 118 },
        { symbol: 'CQGROW', units: 220, avgCost: 94 },
      ],
    },
    {
      email: 'student2@school.com',
      username: 'student_demo_2',
      mainWalletBalance: 200000,
      investmentCash: 120000,
      holdings: [
        { symbol: 'CQTECH', units: 110, avgCost: 121 },
        { symbol: 'CQDIV', units: 320, avgCost: 101.2 },
      ],
    },
    {
      email: 'student3@school.com',
      username: 'student_demo_3',
      mainWalletBalance: 180000,
      investmentCash: 70000,
      holdings: [
        { symbol: 'CQGROW', units: 380, avgCost: 93.4 },
        { symbol: 'CQDIV', units: 240, avgCost: 100.8 },
      ],
    },
  ];

  for (const studentSeed of marketStudentSeeds) {
    const user = await prisma.user.upsert({
      where: { email: studentSeed.email },
      update: {
        username: studentSeed.username,
        roleId: studentRole.id,
        schoolId: school.id,
        isActive: true,
      },
      create: {
        email: studentSeed.email,
        username: studentSeed.username,
        password: studentPassword,
        roleId: studentRole.id,
        schoolId: school.id,
        isActive: true,
      },
    });

    await prisma.classroomStudent.upsert({
      where: {
        classroomId_studentId: {
          classroomId: classroom.id,
          studentId: user.id,
        },
      },
      update: {},
      create: {
        classroomId: classroom.id,
        studentId: user.id,
      },
    });

    const profile = await prisma.studentProfile.upsert({
      where: {
        userId_termId: {
          userId: user.id,
          termId: term.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        termId: term.id,
      },
    });

    await prisma.wallet.upsert({
      where: { studentProfileId: profile.id },
      update: { balance: studentSeed.mainWalletBalance },
      create: {
        studentProfileId: profile.id,
        balance: studentSeed.mainWalletBalance,
      },
    });

    const investmentWallet = await prisma.investmentWallet.upsert({
      where: { studentProfileId: profile.id },
      update: {
        termId: term.id,
        balance: studentSeed.investmentCash,
      },
      create: {
        studentProfileId: profile.id,
        termId: term.id,
        balance: studentSeed.investmentCash,
      },
      select: { id: true },
    });

    await prisma.order.deleteMany({
      where: {
        termId: term.id,
        studentProfileId: profile.id,
      },
    });

    await prisma.holding.deleteMany({
      where: {
        termId: term.id,
        studentProfileId: profile.id,
      },
    });

    await prisma.investmentTransaction.deleteMany({
      where: {
        investmentWalletId: investmentWallet.id,
      },
    });

    for (const holdingSeed of studentSeed.holdings) {
      const product = productBySymbol.get(holdingSeed.symbol);
      if (!product) continue;

      await prisma.holding.create({
        data: {
          studentProfileId: profile.id,
          termId: term.id,
          productId: product.id,
          units: holdingSeed.units,
          avgCost: holdingSeed.avgCost,
        },
      });

      const marketPrice =
        latestPriceByProductId.get(product.id) ?? holdingSeed.avgCost;

      await prisma.order.createMany({
        data: [
          {
            studentProfileId: profile.id,
            termId: term.id,
            productId: product.id,
            side: OrderSide.BUY,
            orderType: OrderType.MARKET,
            requestedPrice: null,
            executedPrice: holdingSeed.avgCost,
            quantity: holdingSeed.units,
            fee: 0,
            weekNo: Math.max(1, currentMarketWeek - 1),
            status: OrderStatus.EXECUTED,
          },
          {
            studentProfileId: profile.id,
            termId: term.id,
            productId: product.id,
            side: OrderSide.SELL,
            orderType: OrderType.MARKET,
            requestedPrice: null,
            executedPrice: marketPrice,
            quantity: Number((holdingSeed.units * 0.1).toFixed(6)),
            fee: 0,
            weekNo: currentMarketWeek,
            status: OrderStatus.EXECUTED,
          },
        ],
      });
    }

    const investedCost = studentSeed.holdings.reduce(
      (sum, item) => sum + item.units * item.avgCost,
      0,
    );
    const transferInAmount = investedCost + studentSeed.investmentCash;

    await prisma.investmentTransaction.create({
      data: {
        investmentWalletId: investmentWallet.id,
        type: InvestmentTransactionType.TRANSFER_IN,
        amount: transferInAmount,
        balanceBefore: 0,
        balanceAfter: studentSeed.investmentCash,
        metadata: {
          source: 'MAIN_WALLET',
          note: 'seed-market-bootstrap',
        } as Prisma.InputJsonValue,
        description: 'Seed transfer into investment wallet',
      },
    });
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
📊 Market Seed: Enabled in Demo Term
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
