// 1. Load Environment Variables ทันที
import 'dotenv/config';

import { PrismaClient, TermStatus } from '@prisma/client';
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

  await prisma.studentProfile.upsert({
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

  console.log(`
✨ Seeding Completed!
📧 Admin Email: ${adminEmail}
🔑 Admin Pass: Admin@1234
📧 Teacher Email: teacher@school.com / Pass: Teacher@1234
📧 Student Email: student@school.com / Pass: Student@1234
📧 Staff Email: staff@school.com / Pass: Staff@1234
🏫 Demo School: ${demoSchoolName}
📚 Demo Term: ${termName}
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
