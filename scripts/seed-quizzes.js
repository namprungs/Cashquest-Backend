const { QuizQuestionType, QuizGradingType, QuestType, QuestStatus } = require('@prisma/client');
const { addDays } = require('date-fns');

/**
 * Seed quizzes and system quest hierarchy
 * Creates:
 * - Compound Interest Quiz (entry-level quiz)
 * - System quest topics (4 main categories) with 12+ sub-quests
 * - Regular quests with embedded quizzes
 */
async function seedQuizzes(
  prisma,
  academicData,
  teacherUser,
  classroom,
) {
  console.log('🧠 กำลัง seed Quiz สำหรับ flow แบบทดสอบ...');

  const { term } = academicData;
  const financeModuleId = academicData.moduleByTitle?.get('Finance Basics') ?? null;
  
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

  // Quiz data map for system quests
  const quizDataMap = {
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
    'เข้าใจดอกเบี้ยทบต้น': [
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

  // Helper function to upsert quest and link to classroom
  const upsertQuest = async (params) => {
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
            difficulty: params.difficulty ?? 'EASY',
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
            difficulty: params.difficulty ?? 'EASY',
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

  // System Quest Topic 1: การออมเงิน
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

  await upsertQuest({
    title: '1.1 เปิดบัญชีออมทรัพย์ครั้งแรก',
    description: 'ทำภารกิจเปิดบัญชีออมทรัพย์ครั้งแรกให้สำเร็จ',
    content:
      'บัญชีออมทรัพย์ (Savings Account) คือ บัญชีธนาคารพื้นฐานที่ใช้สำหรับเก็บเงิน\n' +
      'และรับดอกเบี้ยจากธนาคารในอัตราที่ต่ำแต่มีความปลอดภัยสูง',
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

  // System Quest Topic 2: การวางแผนงบประมาณ
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
    description: 'บันทึกรายจ่ายประจำวันต่อเนื่อง 7 วัน พร้อมสรุปสิ่งที่ได้เรียนรู้',
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
    description: 'วางแผนรายรับรายจ่าย 1 เดือน และส่งลิงก์ไฟล์แผนงบประมาณของตนเอง',
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

  // System Quest Topic 3: การลงทุนเบื้องต้น
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
    description: 'เลือกสินทรัพย์ 3 ประเภทและสรุประดับความเสี่ยงที่เหมาะกับตนเอง',
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

  // System Quest Topic 4: การวางแผนการเงินเพื่ออนาคต
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

  // Additional learning quests
  const questSeeds = [
    {
      title: 'เข้าใจดอกเบี้ยทบต้น',
      description: 'อธิบายตัวอย่างการออมเงิน 12 เดือน พร้อมคำนวณดอกเบี้ยทบต้นแบบสั้นๆ',
      type: QuestType.QUIZ,
      rewardCoins: 300,
      startAt: term.startDate,
      deadlineAt: addDays(term.startDate, 21),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'ตั้งงบประมาณรายเดือน',
      description: 'วางแผนรายรับรายจ่าย 1 เดือน และส่งลิงก์ไฟล์แผนงบประมาณของตนเอง',
      type: QuestType.QUIZ,
      rewardCoins: 250,
      startAt: addDays(term.startDate, 3),
      deadlineAt: addDays(term.startDate, 28),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'จดบันทึกรายจ่าย 7 วัน',
      description: 'บันทึกรายจ่ายประจำวันต่อเนื่อง 7 วัน พร้อมสรุปสิ่งที่ได้เรียนรู้',
      type: QuestType.QUIZ,
      rewardCoins: 200,
      startAt: addDays(term.startDate, 7),
      deadlineAt: addDays(term.startDate, 35),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'วิเคราะห์ความเสี่ยงการลงทุนเบื้องต้น',
      description: 'เลือกสินทรัพย์ 3 ประเภทและสรุประดับความเสี่ยงที่เหมาะกับตนเอง',
      type: QuestType.QUIZ,
      rewardCoins: 220,
      startAt: addDays(term.startDate, 10),
      deadlineAt: addDays(term.startDate, 42),
      isSystem: false,
      status: QuestStatus.PUBLISHED,
    },
    {
      title: 'Interactive ภารกิจจำลองการตัดสินใจทางการเงิน',
      description: 'ภารกิจโต้ตอบที่คุณครูสร้างเองสำหรับให้นักเรียนทำกิจกรรมในระบบ',
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
      rewardCoins: questSeed.rewardCoins,
      startAt: questSeed.startAt,
      deadlineAt: questSeed.deadlineAt,
      isSystem: questSeed.isSystem,
      status: questSeed.status,
    });
  }

  console.log('✅ สร้าง System Quests แบบลำดับชั้นเสร็จสมบูรณ์');
}

module.exports = { seedQuizzes };
