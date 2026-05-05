/**
 * Seed Quests
 */

const {
  QuestType,
  QuestStatus,
  QuestSubmissionType,
  QuizQuestionType,
} = require('@prisma/client');

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
          rewardCoins: 8000,
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
          rewardCoins: 8000,
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
      type: QuestType.QUIZ,
      submissionType: null,
      rewardCoins: 300,
      startAt: term.startDate,
      deadlineAt: addDays(term.startDate, 21),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
      questions: [
        {
          questionText:
            'ถ้าฝากเงิน 10,000 บาท อัตราดอกเบี้ย 5% ต่อปี เมื่อครบ 1 ปี จะได้เงินต้น+ดอกเบี้ยรวมเท่าไหร่?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 1,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 0 },
          choices: {
            create: [
              { choiceText: '10,500 บาท', isCorrect: true, orderNo: 1 },
              { choiceText: '15,000 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '10,050 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '11,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'ดอกเบี้ยทบต้น (Compound Interest) ต่างจากดอกเบี้ยธรรมดาอย่างไร?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 2,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 1 },
          choices: {
            create: [
              {
                choiceText: 'ดอกเบี้ยทบต้นคิดดอกเบี้ยจากยอดเงินต้นเท่านั้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ดอกเบี้ยทบต้นคิดดอกเบี้ยจากเงินต้น+ดอกเบี้ยที่สะสมมา',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ดอกเบี้ยทบต้นให้ผลตอบแทนน้อยกว่าเสมอ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ดอกเบี้ยทบต้นใช้ได้เฉพาะกับการลงทุนในหุ้นเท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ตั้งงบประมาณรายเดือน',
      description:
        'วางแผนรายรับรายจ่าย 1 เดือน และส่งลิงก์ไฟล์แผนงบประมาณของตนเอง',
      type: QuestType.QUIZ,
      submissionType: null,
      rewardCoins: 250,
      startAt: addDays(term.startDate, 3),
      deadlineAt: addDays(term.startDate, 28),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
      questions: [
        {
          questionText:
            'ตามกฎ 50/30/20 หากรายได้ 15,000 บาท ควรจัดสรรเป็นความต้องการ (Wants) เท่าไหร่?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 1,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 2 },
          choices: {
            create: [
              { choiceText: '3,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '7,500 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '4,500 บาท', isCorrect: true, orderNo: 3 },
              { choiceText: '5,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'ข้อใดคือ "ความจำเป็น" (Needs) ตามหลักการจัดทำงบประมาณ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 2,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 0 },
          choices: {
            create: [
              {
                choiceText: 'ค่าเช่าที่อยู่อาศัย',
                isCorrect: true,
                orderNo: 1,
              },
              { choiceText: 'ค่าสมัคร Netflix', isCorrect: false, orderNo: 2 },
              {
                choiceText: 'ค่าซื้อรองเท้าแบรนด์เนม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ค่าท่องเที่ยววันหยุด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'จดบันทึกรายจ่าย 7 วัน',
      description:
        'บันทึกรายจ่ายประจำวันต่อเนื่อง 7 วัน พร้อมสรุปสิ่งที่ได้เรียนรู้',
      type: QuestType.QUIZ,
      submissionType: null,
      rewardCoins: 200,
      startAt: addDays(term.startDate, 7),
      deadlineAt: addDays(term.startDate, 35),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
      questions: [
        {
          questionText: 'การจดบันทึกรายจ่ายช่วยอะไรได้มากที่สุด?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 1,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 1 },
          choices: {
            create: [
              { choiceText: 'ทำให้รวยทันที', isCorrect: false, orderNo: 1 },
              {
                choiceText: 'รู้ว่าเงินหายไปไหนและวางแผนลดรายจ่ายที่ไม่จำเป็น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพิ่มรายได้ให้มากขึ้น',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'ลดดอกเบี้ยเงินกู้', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'ถ้าจดรายจ่ายแล้วพบว่าค่ากาแฟเฉลี่ย 150 บาท/วัน ใน 1 เดือน (30 วัน) ใช้เงินไปกับกาแฟเท่าไหร่?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 2,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 0 },
          choices: {
            create: [
              { choiceText: '4,500 บาท', isCorrect: true, orderNo: 1 },
              { choiceText: '3,000 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '1,500 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '6,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น',
      description:
        'เลือกสินทรัพย์ 3 ประเภทและสรุประดับความเสี่ยงที่เหมาะกับตนเอง',
      type: QuestType.QUIZ,
      submissionType: null,
      rewardCoins: 220,
      startAt: addDays(term.startDate, 10),
      deadlineAt: addDays(term.startDate, 42),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
      questions: [
        {
          questionText:
            'ข้อใดจัดเรียงสินทรัพย์จากความเสี่ยงต่ำไปสู่ได้ถูกต้อง?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 1,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 2 },
          choices: {
            create: [
              {
                choiceText: 'หุ้น > พันธบัตร > เงินฝากออมทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'หุ้น > เงินฝากออมทรัพย์ > พันธบัตร',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText: 'เงินฝากออมทรัพย์ > พันธบัตร > หุ้น',
                isCorrect: true,
                orderNo: 3,
              },
              {
                choiceText: 'พันธบัตร > หุ้น > เงินฝากออมทรัพย์',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'หลักการ "Diversification" คืออะไร?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          orderNo: 2,
          points: 1,
          gradingType: 'AUTO',
          answerKey: { correctIndex: 3 },
          choices: {
            create: [
              {
                choiceText: 'ลงทุนทั้งหมดในสินทรัพย์ที่ให้ผลตอบแทนสูงที่สุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ถือเงินสดไว้ 100% เพื่อความปลอดภัย',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText: 'ลงทุนในหุ้นตัวเดียวที่มั่นใจที่สุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กระจายการลงทุนไปหลายประเภทเพื่อลดความเสี่ยง',
                isCorrect: true,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
  ];

  for (const questSeed of questSeeds) {
    const { questions, ...questData } = questSeed;

    const existing = await prisma.quest.findFirst({
      where: {
        termId: term.id,
        title: questSeed.title,
      },
      select: { id: true, quizId: true },
    });

    // Create or update quiz with questions
    let quizId = existing?.quizId ?? null;
    if (questions && questions.length > 0) {
      if (!quizId) {
        const quiz = await prisma.quiz.create({
          data: {
            timeLimitSec: 600,
            passAllRequired: false,
            questions: { create: questions },
          },
          select: { id: true },
        });
        quizId = quiz.id;
      } else {
        await prisma.quizQuestion.deleteMany({ where: { quizId } });
        await prisma.quiz.update({
          where: { id: quizId },
          data: {
            timeLimitSec: 600,
            passAllRequired: false,
            questions: { create: questions },
          },
        });
      }
    }

    let questId;
    if (existing) {
      const updated = await prisma.quest.update({
        where: { id: existing.id },
        data: {
          ...questData,
          createdById: users.teacherUser.id,
          quizId,
        },
        select: { id: true },
      });
      questId = updated.id;
    } else {
      const created = await prisma.quest.create({
        data: {
          ...questData,
          termId: term.id,
          createdById: users.teacherUser.id,
          quizId,
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
