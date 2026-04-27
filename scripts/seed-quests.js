/**
 * Seed Quests
 */

const { QuestType, QuestStatus, QuestSubmissionType } = require('@prisma/client');

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

async function seedQuests(prisma, academicData, users) {
  console.log('🧭 กำลังสร้างระบบเควส Interactive: เปิดบัญชีครั้งแรก...');

  const { term, classroom } = academicData;

  // Open Account Quest
  const openAccountQuestTitle = 'เปิดบัญชีครั้งแรก';
  const openAccountQuestDescription =
    'ทำภารกิจเปิดบัญชีออมทรัพย์ครั้งแรกให้สำเร็จ (actionType: opensavingaccount)';

  const existingOpenAccountQuest = await prisma.quest.findFirst({
    where: {
      termId: term.id,
      title: openAccountQuestTitle,
    },
    select: { id: true },
  });

  const openAccountQuest = existingOpenAccountQuest
    ? await prisma.quest.update({
        where: { id: existingOpenAccountQuest.id },
        data: {
          createdById: users.teacherUser.id,
          type: QuestType.INTERACTIVE,
          title: openAccountQuestTitle,
          description: openAccountQuestDescription,
          rewardCoins: 100,
          status: QuestStatus.PUBLISHED,
          startAt: term.startDate,
          deadlineAt: term.endDate,
          isSystem: true,
        },
        select: { id: true, title: true },
      })
    : await prisma.quest.create({
        data: {
          termId: term.id,
          createdById: users.teacherUser.id,
          type: QuestType.INTERACTIVE,
          title: openAccountQuestTitle,
          description: openAccountQuestDescription,
          rewardCoins: 100,
          status: QuestStatus.PUBLISHED,
          startAt: term.startDate,
          deadlineAt: term.endDate,
          isSystem: true,
        },
        select: { id: true, title: true },
      });

  await prisma.questClassroom.upsert({
    where: {
      questId_classroomId: {
        questId: openAccountQuest.id,
        classroomId: classroom.id,
      },
    },
    update: {},
    create: {
      questId: openAccountQuest.id,
      classroomId: classroom.id,
    },
  });

  // Other learning quests
  console.log('📝 กำลัง seed เควสเรียนรู้เพิ่มเติมสำหรับนักเรียน...');

  const questSeeds = [
    {
      title: 'เข้าใจดอกเบี้ยทบต้น',
      description:
        'อธิบายตัวอย่างการออมเงิน 12 เดือน พร้อมคำนวณดอกเบี้ยทบต้นแบบสั้นๆ',
      type: QuestType.ASSIGNMENT,
      submissionType: QuestSubmissionType.TEXT,
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
      type: QuestType.PROJECT,
      submissionType: QuestSubmissionType.LINK,
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
      type: QuestType.ASSIGNMENT,
      submissionType: QuestSubmissionType.FILE,
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
      type: QuestType.OTHER,
      submissionType: QuestSubmissionType.TEXT,
      rewardCoins: 220,
      startAt: addDays(term.startDate, 10),
      deadlineAt: addDays(term.startDate, 42),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
  ];

  for (const questSeed of questSeeds) {
    const existing = await prisma.quest.findFirst({
      where: {
        termId: term.id,
        title: questSeed.title,
      },
      select: { id: true },
    });

    let questId;
    if (existing) {
      const updated = await prisma.quest.update({
        where: { id: existing.id },
        data: {
          ...questSeed,
          createdById: users.teacherUser.id,
        },
        select: { id: true },
      });
      questId = updated.id;
    } else {
      const created = await prisma.quest.create({
        data: {
          ...questSeed,
          termId: term.id,
          createdById: users.teacherUser.id,
        },
        select: { id: true },
      });
      questId = created.id;
    }

    await prisma.questClassroom.upsert({
      where: {
        questId_classroomId: {
          questId,
          classroomId: classroom.id,
        },
      },
      update: {},
      create: {
        questId,
        classroomId: classroom.id,
      },
    });
  }

  console.log('✅ Quests seeded');
}

module.exports = { seedQuests, addDays };
