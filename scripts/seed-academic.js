/**
 * Seed Academic Data (School, Term, Classroom, LifeStages, TermStageRules)
 */

const { TermStatus } = require('@prisma/client');

const calculateTotalWeeks = (startDate, endDate) => {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.ceil(diffDays / 7));
};

async function seedAcademic(prisma, users) {
  console.log(
    '🏫 กำลังสร้างข้อมูล Dev: school/term/life-stage/classroom...',
  );

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

  // Update user school associations
  await prisma.user.update({
    where: { id: users.teacherUser.id },
    data: { schoolId: school.id },
  });

  await prisma.user.update({
    where: { id: users.studentUser.id },
    data: { schoolId: school.id },
  });

  await prisma.user.update({
    where: { id: users.staffUser.id },
    data: { schoolId: school.id },
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

  // Seed term weeks
  await prisma.termWeek.deleteMany({ where: { termId: term.id } });

  const termWeeksData = [];
  for (let weekNo = 1; weekNo <= totalWeeks; weekNo++) {
    const startOfWeek = new Date(termStartDate);
    startOfWeek.setDate(startOfWeek.getDate() + (weekNo - 1) * 7);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    termWeeksData.push({
      termId: term.id,
      weekNo,
      startDate: startOfWeek,
      endDate: endOfWeek,
    });
  }

  if (termWeeksData.length > 0) {
    await prisma.termWeek.createMany({ data: termWeeksData });
  }

  // Seed life stages
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
      name: 'วัยเตรียมเกษียณ',
      orderNo: 4,
      unlockInvestment: true,
      enableRandomExpense: true,
    },
  ];

  const lifeStages = [];
  for (const stage of lifeStageDefs) {
    const existing = await prisma.lifeStage.findFirst({
      where: { name: stage.name },
      select: { id: true, orderNo: true },
    });

    if (existing) {
      const updated = await prisma.lifeStage.update({
        where: { id: existing.id },
        data: stage,
      });
      lifeStages.push({ id: updated.id, name: updated.name, orderNo: updated.orderNo });
    } else {
      const created = await prisma.lifeStage.create({ data: stage });
      lifeStages.push({ id: created.id, name: created.name, orderNo: created.orderNo });
    }
  }

  // Seed term stage rules
  await prisma.termStageRule.deleteMany({ where: { termId: term.id } });

  const sortedStages = lifeStages.sort((a, b) => a.orderNo - b.orderNo);
  if (sortedStages.length > 0) {
    const stageRulesData = sortedStages.map((stage, index) => {
      const stagesPerPeriod = Math.ceil(totalWeeks / sortedStages.length);
      return {
        termId: term.id,
        lifeStageId: stage.id,
        startWeek: index * stagesPerPeriod + 1,
        endWeek: (index + 1) * stagesPerPeriod,
      };
    });

    const lastRule = stageRulesData[stageRulesData.length - 1];
    if (lastRule) {
      lastRule.endWeek = totalWeeks;
    }

    await prisma.termStageRule.createMany({ data: stageRulesData });
  }

  // Seed classroom
  const classroomName = 'มัธยมศึกษาปีที่ 6/4';
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
        teacherId: users.teacherUser.id,
      },
    }));

  await prisma.classroom.update({
    where: { id: classroom.id },
    data: {
      teacherId: users.teacherUser.id,
      termId: term.id,
      name: classroomName,
    },
  });

  // Add student to classroom
  await prisma.classroomStudent.upsert({
    where: {
      classroomId_studentId: {
        classroomId: classroom.id,
        studentId: users.studentUser.id,
      },
    },
    update: {},
    create: {
      classroomId: classroom.id,
      studentId: users.studentUser.id,
    },
  });

  // Create student profile
  const demoStudentProfile = await prisma.studentProfile.upsert({
    where: {
      userId_termId: {
        userId: users.studentUser.id,
        termId: term.id,
      },
    },
    update: {},
    create: {
      userId: users.studentUser.id,
      termId: term.id,
    },
  });

  // Create wallet
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

  return { school, term, classroom, demoStudentProfile, lifeStages, totalWeeks };
}

module.exports = { seedAcademic, calculateTotalWeeks };
