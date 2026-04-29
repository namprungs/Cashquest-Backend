const {
  QuizQuestionType,
  QuizGradingType,
  QuestType,
  QuestStatus,
} = require('@prisma/client');
const { addDays } = require('date-fns');

/**
 * Seed quizzes from CashQuest Stage 2 syllabus (W5-W8)
 * 80 Multiple Choice quests, 4 per day, 5 days per week
 * Each quest has 2 questions with 4 choices
 */
async function seedQuizzes(prisma, academicData, teacherUser, classroom) {
  console.log('🧠 กำลัง seed Quests จาก Syllabus (W5-W8, 80 quests)...');

  const { term } = academicData;
  const termStart = new Date(term.startDate);

  /**
   * Calculate the startAt date for a given W#D# code.
   * Week 5 starts at term.startDate + 28 days (4 weeks offset).
   * Each day within the week adds 1 day.
   * deadlineAt = end of that same day (startAt + 1 day).
   */
  function getQuestDate(weekNum, dayNum) {
    const weekOffset = (weekNum - 5) * 7; // W5 = 0 offset, W6 = 7, etc.
    const dayOffset = weekOffset + (dayNum - 1);
    const startAt = addDays(termStart, dayOffset);
    const deadlineAt = addDays(startAt, 1);
    return { startAt, deadlineAt };
  }

  // Helper: upsert quest with auto-generated quiz
  const upsertQuestWithQuiz = async (params) => {
    const existing = await prisma.quest.findFirst({
      where: { termId: term.id, title: params.title },
      select: { id: true, quizId: true },
    });

    // Create or reuse quiz
    let quizId = existing?.quizId ?? null;
    if (!quizId) {
      const quiz = await prisma.quiz.create({
        data: {
          timeLimitSec: 600,
          passAllRequired: false,
          questions: {
            create: params.questions,
          },
        },
        select: { id: true },
      });
      quizId = quiz.id;
    } else {
      // Update existing quiz questions
      const existingQuiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: { questions: { select: { id: true } } },
      });
      // Delete old questions and recreate
      await prisma.quizQuestion.deleteMany({ where: { quizId } });
      await prisma.quiz.update({
        where: { id: quizId },
        data: {
          timeLimitSec: 600,
          passAllRequired: false,
          questions: {
            create: params.questions,
          },
        },
      });
    }

    const quest = existing
      ? await prisma.quest.update({
          where: { id: existing.id },
          data: {
            type: QuestType.QUIZ,
            description: params.description ?? null,
            content: params.content ?? null,
            rewardCoins: params.rewardCoins,
            difficulty: params.difficulty ?? 'EASY',
            status: params.status,
            submissionType: null,
            quizId,
            startAt: params.startAt,
            deadlineAt: params.deadlineAt,
            isSystem: params.isSystem,
          },
          select: { id: true },
        })
      : await prisma.quest.create({
          data: {
            termId: term.id,
            createdById: teacherUser.id,
            type: QuestType.QUIZ,
            title: params.title,
            description: params.description ?? null,
            content: params.content ?? null,
            rewardCoins: params.rewardCoins,
            difficulty: params.difficulty ?? 'EASY',
            status: params.status,
            submissionType: null,
            quizId,
            startAt: params.startAt,
            deadlineAt: params.deadlineAt,
            isSystem: params.isSystem,
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

  // Quest definitions from syllabus
  const syllabusQuests = [
    {
      title: 'กฎ 50/30/20: งบประมาณส่วนบุคคล',
      description:
        'กฎ 50/30/20 คือสูตรงบประมาณที่นักการเงินแนะนําเรียบง่ายแต่ถ้าทําได้จริงชีวิตการเงินเปลี่ยนแน่นอน',
      content:
        'กฎ 50/30/20 แบ่งรายได้เป็น 3 ส่วน : 50% — Needs ( ความจําเป็น ): ค่าเช่าค่าอาหารค่าเดินทางค่าเทอมสาธารณูปโภค 30% — Wants ( ความต้องการ ): บันเทิงท่องเที่ยวช้อปปิ้งของที่ชอบ 20% — Save & Invest: เงินฉุกเฉิน + ออมระยะยาว + ลงทุนตัวอย่างรายได้ 15,000 บาท / เดือน : → 7,500 บาท : ค่าหอ 5,000 + ค่าเดินทาง 1,500 + สาธารณูปโภค 1,000 → 4,500 บาท : อาหารนอกกาแฟบันเทิงเที่ยว → 3,000 บาท : ออมฉุกเฉิน 2,000 + ลงทุน 1,000 สําคัญ : ถ้า Needs เกิน 50% ต้องหาวิธีลดก่อนไม่ใช่ตัด Save',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 1,
      questions: [
        {
          questionText:
            'ตามกฎ 50/30/20 รายได้ 20,000 บาทควรออมและลงทุนเดือนละเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '2,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '4,000 บาท', isCorrect: true, orderNo: 2 },
              { choiceText: '6,000 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '10,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'ถ้า Needs ( ความจําเป็น ) ของคุณมากกว่า 50% ของรายได้ควรทําอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลดส่วนออม / ลงทุนก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'หาทางลดค่าใช้จ่ายจําเป็นหรือเพิ่มรายได้ก่อน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ยืมเงินเพื่อนมาเสริม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่ต้องทําอะไรเพราะเป็นค่าใช้จ่ายจําเป็น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ทํา Budget Planner ให้ได้ผลจริง',
      description:
        'Budget Planner ไม่ใช่แค่ตารางแต่คือระบบที่ต้องอัปเดตทุกเดือนเพื่อให้รู้ว่าเงินไปอยู่ที่ไหน',
      content:
        '4 ขั้นตอนทํา Budget Planner ให้ได้ผล : 1. บันทึกรายได้ทั้งหมด : เงินจากพ่อแม่ + งานพิเศษ + ทุนการศึกษา 2. แยกรายจ่ายเป็น Needs / Wants / Save ตามกฎ 50/30/20 3. ติดตามรายจ่ายจริงทุกสัปดาห์ ( ใช้แอป Moneywise, Piggy, หรือ Spreadsheet) 4. เปรียบเทียบแผน vs จริงแล้วปรับปรุงทุกต้นเดือนเครื่องมือง่ายๆ : → แอปมือถือ : Moneywise, Money Lover, Piggy → Excel/Google Sheets: จดทุกรายจ่ายแยก Category ข้อผิดพลาดที่พบบ่อย : วางแผนแล้วลืมติดตาม → ต้องตรวจสอบสัปดาห์ละครั้ง',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 1,
      questions: [
        {
          questionText:
            'ขั้นตอนแรกของการทํา Budget Planner ที่ถูกต้องคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เริ่มจากตัดค่าใช้จ่ายที่ไม่จําเป็น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'บันทึกรายได้ทั้งหมดให้ครบก่อน',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'หาแอปที่ดีที่สุด', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ตั้งเป้าหมายการออมก่อน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'เหตุใด Budget Planner จึงต้องติดตามและปรับทุกเดือน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'เพราะกฎหมายบังคับ', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'เพราะรายได้และรายจ่ายจริงมักต่างจากแผนและสถานการณ์เปลี่ยนได้ทุกเดือน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะแอปอัปเดตโดยอัตโนมัติ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะเป็นข้อกําหนดของธนาคาร',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Net Worth: วัดความมั่งคั่งที่แท้จริง',
      description:
        'Net Worth คือตัวเลขเดียวที่บอกสุขภาพการเงินของคุณได้ดีที่สุดรู้ตัวเลขนี้แล้วจะวางแผนได้ชัดขึ้น',
      content:
        'Net Worth = สินทรัพย์ (Assets) − หนี้สิน (Liabilities) สินทรัพย์ (Assets): → เงินสดเงินในธนาคาร → กองทุนรวมหุ้นทองคํา → ทรัพย์สินที่มีมูลค่า ( รถโน้ตบุ๊ก ) หนี้สิน (Liabilities): → หนี้กยศ . / หนี้กู้เงิน → ยอดค้างบัตรเครดิต → เงินที่ยืมผู้อื่นตัวอย่าง : สินทรัพย์ 25,000 บาท − หนี้ 80,000 บาท = Net Worth -55,000 บาท " ไม่เป็นไรถ้าติดลบแต่ต้องเพิ่มขึ้นทุกปี !" — เป้าหมายคือทําให้ Net Worth เพิ่มทุกปี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 1,
      questions: [
        {
          questionText: 'Net Worth คํานวณอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รายได้ − ค่าใช้จ่าย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'สินทรัพย์ − หนี้สิน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เงินออม + การลงทุน',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'รายได้รวมต่อปี', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'นักศึกษา Net Worth ติดลบ -80,000 บาทควรรู้สึกอย่างไรและทําอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'วิกฤตต้องกู้เงินเพิ่ม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ปกติสําหรับนักศึกษาแต่ต้องพยายามให้ Net Worth เพิ่มขึ้นทุกปี',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่สําคัญรอให้รวยก่อนแล้วค่อยคิด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'หยุดใช้จ่ายทุกอย่างจนกว่า Net Worth จะเป็นบวก',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ภาษีเงินได้บุคคลธรรมดา : รู้ก่อนทํางาน 🌐 Financial Knowledge',
      description:
        'ทันทีที่ทํางานและมีรายได้ถึงเกณฑ์คุณต้องยื่นภาษีเข้าใจระบบภาษีไทยช่วยวางแผนการเงินได้ดีขึ้นมาก',
      content:
        'ภาษีเงินได้บุคคลธรรมดา (Personal Income Tax) ไทย : ใครต้องเสีย : บุคคลที่มีรายได้เกิน 120,000 บาท / ปี ( คนโสด ) หรือ 220,000 บาท / ปี ( คู่สมรส ) อัตราภาษีแบบขั้นบันได (Progressive Tax): → 0-150,000 บาท : ยกเว้น 0% → 150,001-300,000 บาท : 5% → 300,001-500,000 บาท : 10% → 500,001-750,000 บาท : 15% → 750,001-1,000,000 บาท : 20% → สูงกว่านี้ขึ้นไปถึง 35% ค่าลดหย่อนสําคัญ : ค่าใช้จ่าย 50% ( ไม่เกิน 100,000), ส่วนตัว 60,000, ประกันชีวิต , RMF/SSF ยิ่งมีรายได้สูงยิ่งต้องวางแผนภาษีให้ดี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 1,
      questions: [
        {
          questionText: 'ระบบภาษีเงินได้ไทยเป็นแบบใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'อัตราคงที่ 20% สําหรับทุกคน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ขั้นบันได — รายได้สูงขึ้นอัตราภาษีสูงขึ้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'จ่ายเท่ากันทุกคนไม่ว่าจะรายได้เท่าไหร่',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เฉพาะคนรวยต้องเสียภาษี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'รายได้ส่วนแรก 150,000 บาทต่อปีเสียภาษีเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: '5% = 7,500 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '10% = 15,000 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: 'ยกเว้น 0 บาท', isCorrect: true, orderNo: 3 },
              { choiceText: '20% = 30,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Assets vs Liabilities: สินทรัพย์และหนี้สิน',
      description:
        'เข้าใจความต่างระหว่างสินทรัพย์และหนี้สินเป็นก้าวแรกในการสร้างความมั่งคั่งระยะยาว',
      content:
        'สินทรัพย์ (Assets) = สิ่งที่ " ใส่เงินเข้ากระเป๋า " หรือมีมูลค่า : → เงินสดเงินฝากกองทุนรวมหุ้นทองคํา → อสังหาริมทรัพย์ที่ให้ค่าเช่า → ธุรกิจที่มีกําไรหนี้สิน (Liabilities) = สิ่งที่ " ดึงเงินออกจากกระเป๋า ": → หนี้กู้ยืม ( กยศ . บัตรเครดิตสินเชื่อ ) → ดอกเบี้ยที่ต้องจ่าย → ค่าเช่าที่ค้างจ่าย Robert Kiyosaki แนะนําว่า : " คนรวยซื้อสินทรัพย์คนจนซื้อหนี้สินคนชั้นกลางซื้อหนี้สินที่คิดว่าเป็นสินทรัพย์ " บ้านที่อยู่เอง : สินทรัพย์หรือหนี้สิน ? ( ตอบ : ขึ้นกับ — ถ้าผ่อนอยู่คือหนี้สินถ้าให้เช่าคือสินทรัพย์ )',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 2,
      questions: [
        {
          questionText: 'ข้อใดจัดเป็น " สินทรัพย์ " ในแง่การเงินส่วนบุคคล ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'บัตรเครดิตที่มีวงเงิน 50,000 บาท',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'กองทุนรวมที่ลงทุนไปแล้ว 20,000 บาท',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'หนี้กยศ . ที่ยังค้างอยู่',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ค่าเช่าที่ต้องจ่ายทุกเดือน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไม " รถยนต์ส่วนตัว " มักถูกจัดว่าเป็นหนี้สินไม่ใช่สินทรัพย์ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะราคารถแพงเกินไป',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะรถเสื่อมราคาทุกปีและมีค่าใช้จ่ายต่อเนื่องไม่ได้สร้างรายได้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะต้องเสียภาษีรถ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะธนาคารไม่ยอมรับเป็นหลักประกัน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'คํานวณ Net Worth ของตัวเอง',
      description:
        'ลองคํานวณ Net Worth จากสถานการณ์จริงและเข้าใจว่าทําไมต้องทําให้เพิ่มขึ้นทุกปี',
      content:
        'ตัวอย่างคํานวณ Net Worth นักศึกษาชั้นปี 2: สินทรัพย์ : → เงินในธนาคาร : 15,000 บาท → กองทุนรวมที่เริ่มลงทุน : 8,000 บาท → โน้ตบุ๊กส่วนตัว : 12,000 บาทรวมสินทรัพย์ : 35,000 บาทหนี้สิน : → หนี้กยศ .: 100,000 บาท → บัตรเครดิตค้างจ่าย : 5,000 บาทรวมหนี้สิน : 105,000 บาท Net Worth = 35,000 - 105,000 = -70,000 บาทแผนปรับปรุง : ชําระหนี้ดอกเบี้ยสูงก่อนเพิ่มสินทรัพย์ด้วยการลงทุนสมํ่าเสมอเป้าหมาย : ทําให้ Net Worth เพิ่มขึ้นอย่างน้อย 12,000 บาทต่อปี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 2,
      questions: [
        {
          questionText: 'จากตัวอย่าง Net Worth ของนักศึกษาคนนี้คือเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '+35,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '-70,000 บาท', isCorrect: true, orderNo: 2 },
              { choiceText: '-105,000 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '+70,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'วิธีเพิ่ม Net Worth ที่ถูกต้องคือข้อใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กู้เงินเพิ่มเพื่อซื้อของที่มีมูลค่า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพิ่มสินทรัพย์ ( ออม / ลงทุน ) และลดหนี้สินพร้อมกัน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ซ่อนรายจ่ายบางส่วนไม่บันทึก',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รอให้โบนัสมาแล้วค่อยปรับ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'SMART Goal ทางการเงิน',
      description:
        'SMART Goal เปลี่ยนความฝันเรื่องเงินให้กลายเป็นแผนที่วัดได้และทําได้จริง',
      content:
        'SMART Goal Framework ใช้ตั้งเป้าหมายการเงิน : S — Specific: ระบุให้ชัด " ออมเงิน 50,000 บาทสําหรับฉุกเฉิน " M — Measurable: วัดได้ "2,500 บาท / เดือนติดตามทุกสิ้นเดือน " A — Achievable: ทําได้จริง " รายได้เสริม 5,000 / เดือนออม 50% ได้ " R — Relevant: สอดคล้องเป้าหมายชีวิต " เงินฉุกเฉินคือพื้นฐานก่อนลงทุน " T — Time-bound: มีกําหนดเวลา " ภายใน 20 เดือน " ตัวอย่างเป้าหมายที่ไม่ใช่ SMART: " อยากรวย " — ไม่ Specific, ไม่ Measurable, ไม่ Time-bound ตัวอย่างที่ดี : " ออม 1,000 บาท / เดือนลงทุนในกองทุน SET50 Index ด้วย DCA ภายใน 12 เดือนแรกของการทํางาน "',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 2,
      questions: [
        {
          questionText: 'ใน SMART Goal ตัว "M" หมายถึงอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'Motivating — สร้างแรงบันดาลใจ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'Measurable — วัดได้และติดตามได้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Monetary — เกี่ยวกับเงิน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'Maximum — มากที่สุดเท่าที่จะทําได้',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'เป้าหมายใดเป็น SMART Goal ที่ดีที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'อยากมีเงินเยอะๆก่อนอายุ 30',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ออม 2,000 บาท / เดือนเข้ากองทุน RMF ภายใน 1 ปีหลังเริ่มทํางาน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'พยายามประหยัดให้ได้มากที่สุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนในหุ้นที่กําไรดีที่สุด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'บัตรเครดิต : เครื่องมือหรือกับดัก ? 🌐 Financial Knowledge',
      description:
        'บัตรเครดิตมีประโยชน์มากถ้าใช้ถูกวิธีแต่ถ้าใช้ผิดวิธีดอกเบี้ย 18- 28% / ปีจะกลายเป็นวงวนหนี้ที่หนีไม่พ้น',
      content:
        'บัตรเครดิต vs บัตรเดบิต : บัตรเดบิต : ตัดเงินจากบัญชีทันทีใช้ได้แค่เท่าที่มีไม่มีดอกเบี้ยบัตรเครดิต : ธนาคารจ่ายแทนก่อนผู้ถือต้องชําระคืนภายในรอบบัญชีดอกเบี้ยบัตรเครดิต : สูงมาก ! 16-28% ต่อปี ( เฉลี่ย ~20%) กับดักที่ต้องระวัง : → จ่ายแค่ยอดขั้นตํ่า (5-10%) → เสียดอกเบี้ยสูงมาก → ยอดค้าง 10,000 บาทจ่ายแค่ขั้นตํ่า → ใช้เวลา 3-5 ปีกว่าจะหมด ! วิธีใช้บัตรเครดิตอย่างฉลาด : → ชําระเต็มจํานวนก่อนวันครบกําหนดทุกเดือน → ใช้สะสมแต้ม / เงินคืนแต่ห้ามใช้เกินที่มีในบัญชี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 2,
      questions: [
        {
          questionText:
            'ดอกเบี้ยบัตรเครดิตในไทยโดยเฉลี่ยอยู่ที่เท่าไหร่ต่อปี ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '5-8% ต่อปี', isCorrect: false, orderNo: 1 },
              { choiceText: '10-12% ต่อปี', isCorrect: false, orderNo: 2 },
              { choiceText: '16-28% ต่อปี', isCorrect: true, orderNo: 3 },
              { choiceText: '30-40% ต่อปี', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'วิธีใช้บัตรเครดิตที่ฉลาดที่สุดคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'จ่ายแค่ยอดขั้นตํ่าทุกเดือนเพื่อรักษาสภาพคล่อง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ชําระเต็มจํานวนทุกเดือนก่อนวันครบกําหนด',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ใช้ให้เต็มวงเงินเพื่อสะสมแต้มมากที่สุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กู้เงินมาชําระบัตรเครดิตเพราะดอกเบี้ยตํ่ากว่า',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'เป้าหมายการเงิน 3 ระยะ',
      description:
        'เป้าหมายการเงินที่ดีต้องครอบคลุม 3 ช่วงเวลาทําพร้อมกันไม่ได้แต่ต้องวางแผนไว้ล่วงหน้า',
      content:
        'เป้าหมายการเงิน 3 ระยะ ( จาก WMD1001): ระยะสั้น (< 1 ปี ): → เป้าหมาย : Emergency Fund 30,000-50,000 บาท , ซื้ออุปกรณ์จําเป็น → เครื่องมือ : บัญชีออมทรัพย์ , บัญชีฝากประจํา 3-6 เดือนระยะกลาง (1-5 ปี ): → เป้าหมาย : ทุนเรียนต่อ , ซื้อรถ , เงินดาวน์บ้าน → เครื่องมือ : ฝากประจํา , กองทุนตราสารหนี้ , กองทุนผสมระยะยาว (5+ ปี ): → เป้าหมาย : เงินเกษียณ , ซื้อบ้าน → เครื่องมือ : หุ้น , กองทุนหุ้น , RMF/SSF หลักการ : ใช้สินทรัพย์ที่ความเสี่ยงสูงขึ้นเมื่อระยะเวลายาวขึ้น',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 3,
      questions: [
        {
          questionText:
            'เครื่องมือใดเหมาะสมที่สุดสําหรับเป้าหมาย " ซื้อรถ " ใน 3 ปี ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กองทุนหุ้นความเสี่ยงสูง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'บัญชีออมทรัพย์ธรรมดา',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText: 'กองทุนตราสารหนี้หรือกองทุนผสมระยะกลาง',
                isCorrect: true,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนใน Cryptocurrency',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมเป้าหมายระยะยาวเช่นเกษียณจึงควรลงทุนในหุ้นมากกว่าเงินฝาก ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นไม่มีความเสี่ยง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'มีเวลานานพอให้ผลตอบแทนสูงชนะเงินเฟ้อและความผันผวนระยะสั้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ธนาคารบังคับให้ลงทุนในหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'หุ้นให้ผลตอบแทนสูงเสมอไม่ว่าจะถือนานแค่ไหน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Emergency Fund: เกราะกันภัยทางการเงิน',
      description:
        'กองทุนฉุกเฉินคือสิ่งแรกที่ต้องมีก่อนลงทุนเพราะถ้าไม่มีแล้วเกิดเหตุฉุกเฉินต้องขายสินทรัพย์ทิ้งซึ่งเสียหายมาก',
      content:
        'Emergency Fund คือเงินสํารองสําหรับเหตุฉุกเฉิน : → ตกงานกะทันหัน , เจ็บป่วย , รถเสีย , ซ่อมแซมสิ่งจําเป็นควรมีเท่าไหร่ : → โสดไม่มีภาระ : 3 เดือนของค่าใช้จ่ายประจํา → มีครอบครัวหรือภาระสูง : 6-12 เดือนเก็บไว้ที่ไหน : บัญชีออมทรัพย์หรือกองทุนตลาดเงิน → ต้องถอนได้ทันที ( สภาพคล่องสูง ) → ไม่ควรนําไปลงทุนในหุ้น ( เพราะอาจต้องขายตอนราคาตก ) ตัวอย่าง : ค่าใช้จ่าย 10,000 บาท / เดือน → Emergency Fund ควรมี 30,000-60,000 บาทวิธีเริ่ม : ออม 20% ของรายได้ต่อเดือนจนครบ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 3,
      questions: [
        {
          questionText: 'ทําไมต้องมี Emergency Fund ก่อนเริ่มลงทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะหุ้นไม่ให้ผลตอบแทนในระยะสั้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะถ้าเกิดฉุกเฉินจะได้ไม่ต้องขายสินทรัพย์ลงทุนทิ้งในราคาไม่ดี',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะธนาคารบังคับ', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะดอกเบี้ยเงินฝากสูงกว่าหุ้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'Emergency Fund ควรเก็บไว้ในสินทรัพย์ประเภทใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นที่มีสภาพคล่องสูง',
                isCorrect: false,
                orderNo: 1,
              },
              { choiceText: 'อสังหาริมทรัพย์', isCorrect: false, orderNo: 2 },
              {
                choiceText: 'บัญชีออมทรัพย์หรือกองทุนตลาดเงินที่ถอนได้ทันที',
                isCorrect: true,
                orderNo: 3,
              },
              { choiceText: 'ทองคําแท่ง', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'DCA เบื้องต้น : ลงทุนทุกเดือนอย่างสมํ่าเสมอ',
      description:
        'DCA (Dollar Cost Averaging) คือวิธีลงทุนที่เหมาะที่สุดสําหรับคนมีรายได้ประจําเพราะไม่ต้องเดาตลาด',
      content:
        'DCA คือการลงทุนจํานวนเงินเท่ากันทุกงวดโดยไม่สนใจว่าราคาจะขึ้นหรือลงทําไม DCA ได้ผล : → เดือนราคาสูง : ซื้อได้น้อยหน่วย ( ลงทุนน้อยลงโดยอัตโนมัติ ) → เดือนราคาตํ่า : ซื้อได้มากหน่วย ( ซื้อเพิ่มอัตโนมัติ ) → ผลลัพธ์ : ต้นทุนเฉลี่ยตํ่ากว่าการซื้อครั้งเดียวตัวอย่าง DCA กองทุน 2,000 บาท / เดือน (WMD1401): → เดือน 1: NAV 10 บาท → ซื้อ 200 หน่วย → เดือน 2: NAV 8 บาท → ซื้อ 250 หน่วย → เดือน 3: NAV 12 บาท → ซื้อ 167 หน่วย → ต้นทุนเฉลี่ย 9.72 บาท < ราคาเฉลี่ย 10 บาท ! DCA เหมาะกับ : นักลงทุนระยะยาวที่มีรายได้ประจําไม่มีเวลาติดตามตลาดทุกวัน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 3,
      questions: [
        {
          questionText: 'DCA ช่วยผู้ลงทุนอย่างไรเมื่อราคาสินทรัพย์ลดลง ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หยุดลงทุนอัตโนมัติเพื่อรักษาเงิน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ซื้อหน่วยได้มากขึ้นในราคาถูกลงลดต้นทุนเฉลี่ย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขายสินทรัพย์ออกก่อนราคาลงตํ่ากว่านี้',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เปลี่ยนไปลงทุนในสินทรัพย์อื่น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'DCA เหมาะกับนักลงทุนประเภทใดมากที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'นักลงทุนที่ต้องการกําไรระยะสั้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'นักลงทุนที่มีเวลาติดตามตลาดทุกวัน',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText:
                  'คนมีรายได้ประจําต้องการสะสมทรัพย์ระยะยาวโดยไม่ต้องเดาตลาด',
                isCorrect: true,
                orderNo: 3,
              },
              {
                choiceText: 'นักเก็งกําไรที่ชํานาญ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กยศ .: กู้เงินเรียนต้องรู้อะไรบ้าง 🌐 Financial Knowledge',
      description:
        'กยศ . ช่วยให้คนเรียนได้แต่ต้องเข้าใจเงื่อนไขและการชําระคืนก่อนตัดสินใจกู้',
      content:
        'กยศ . ( กองทุนเงินให้กู้ยืมเพื่อการศึกษา ) ก่อตั้งปี 2539 ใครกู้ได้ : นักเรียน / นักศึกษาที่ขาดแคลนทุนทรัพย์รายได้ครัวเรือนไม่เกิน 360,000 บาท / ปีกู้ได้เท่าไหร่ : ค่าเล่าเรียน + ค่าครองชีพ ( แล้วแต่ระดับชั้น ) ดอกเบี้ย : 1% ต่อปี ( ตํ่ามากเป็นดอกเบี้ยนโยบายเพื่อสังคม ) การชําระคืน : เริ่มชําระหลังจบการศึกษา 2 ปีผ่อนนาน 15 ปีโครงการกรอ .: คืนเงินเป็นเปอร์เซ็นต์ของรายได้ (Income-Contingent Loan) ข้อควรระวัง : → ถ้าไม่ชําระตามกําหนดมีค่าปรับเพิ่ม → ปัจจุบันมียอดหนี้รวมนับแสนล้านบาทในระบบ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 3,
      questions: [
        {
          questionText: 'ดอกเบี้ยของกยศ . อยู่ที่เท่าไหร่ต่อปี ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '5% ต่อปี', isCorrect: false, orderNo: 1 },
              { choiceText: '3% ต่อปี', isCorrect: false, orderNo: 2 },
              { choiceText: '1% ต่อปี', isCorrect: true, orderNo: 3 },
              { choiceText: 'ไม่มีดอกเบี้ย', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ผู้กู้กยศ . ต้องเริ่มชําระคืนเมื่อใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทันทีที่จบการศึกษา',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: '2 ปีหลังจากจบการศึกษา',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เมื่อมีรายได้ถึง 1 ล้านบาท',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'อายุ 30 ปี', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'วิธีเพิ่ม Net Worth ทีละขั้น',
      description:
        'Net Worth เพิ่มได้สองทาง : เพิ่มสินทรัพย์หรือลดหนี้สินทําทั้งสองพร้อมกันได้ผลดีที่สุด',
      content:
        'กลยุทธ์เพิ่ม Net Worth: ด้านสินทรัพย์ — เพิ่ม Assets: → ออมสมํ่าเสมอทุกเดือน ( แม้ 500 บาทก็สําคัญ ) → ลงทุนในสินทรัพย์ที่เติบโต ( กองทุนหุ้น ) → พัฒนาทักษะ → รายได้สูงขึ้น → ออมได้มากขึ้นด้านหนี้สิน — ลด Liabilities: → ชําระหนี้ดอกเบี้ยสูงก่อน ( บัตรเครดิต 20- 28% / ปีก่อน ) → หลีกเลี่ยงหนี้ใหม่ที่ไม่จําเป็น → Debt Snowball: ชําระหนี้ก้อนเล็กก่อนสร้างแรงจูงใจ → Debt Avalanche: ชําระหนี้ดอกเบี้ยสูงก่อนประหยัดเงินได้มากกว่าเป้าหมาย : Net Worth เพิ่มขึ้นทุกปีไม่ว่าจะเริ่มจากติดลบแค่ไหน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 4,
      questions: [
        {
          questionText:
            'ระหว่าง "Debt Snowball" และ "Debt Avalanche" ต่างกันอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText:
                  'Snowball ชําระหนี้ก้อนใหญ่ก่อน Avalanche ชําระก้อนเล็กก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'Snowball ชําระหนี้ก้อนเล็กก่อน Avalanche ชําระหนี้ดอกเบี้ยสูงก่อน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ทั้งสองวิธีเหมือนกัน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText:
                  'Snowball ใช้กับบัตรเครดิต Avalanche ใช้กับกยศ . เท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมควรชําระหนี้บัตรเครดิตก่อนหนี้กยศ . ( เมื่อมีเงินพอ )?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะกยศ . ไม่มีกําหนดชําระ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะบัตรเครดิตดอกเบี้ย 20-28% สูงกว่ากยศ . ที่ 1% มาก',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะธนาคารบังคับ', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะบัตรเครดิตส่งผลต่อ Credit Score มากกว่า',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กฎ 50/30/20 ปรับใช้กับชีวิตนักศึกษา',
      description:
        'กฎ 50/30/20 อาจต้องปรับให้เข้ากับความเป็นจริงของนักศึกษาที่รายได้ไม่สมํ่าเสมอ',
      content:
        'ความท้าทายของนักศึกษากับกฎ 50/30/20: ปัญหา : รายได้ไม่แน่นอน ( เงินครอบครัว + งานพิเศษ + ทุน ) วิธีปรับ : ใช้รายได้เฉลี่ย 3 เดือนเป็นฐานตัวอย่างปรับใช้รายได้ 12,000 บาท / เดือน : Needs 50% = 6,000 บาท : → ค่าหอ 3,500 + ค่าเดินทาง 1,500 + ค่าเทอมเฉลี่ย 1,000 Wants 30% = 3,600 บาท : → อาหารนอก 2,000 + กาแฟ / บันเทิง 1,000 + อื่นๆ 600 Save 20% = 2,400 บาท : → Emergency Fund 1,500 + ลงทุนกองทุน 900 เคล็ดลับ : ถ้า Needs เกิน 50% → หาหอถูกกว่าหรือหารูมเมทช่วยแชร์',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 4,
      questions: [
        {
          questionText:
            'นักศึกษาที่มีรายได้ไม่แน่นอนควรคํานวณงบประมาณอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ใช้รายได้สูงสุดในเดือนที่ดีที่สุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ใช้รายได้เฉลี่ย 3 เดือนเป็นฐานในการวางแผน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'วางแผนใหม่ทุกสัปดาห์ตามรายได้จริง',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่ต้องวางแผนเพราะรายได้ไม่แน่นอน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ถ้าค่าใช้จ่ายจําเป็น (Needs) กินไป 65% ของรายได้วิธีแก้ที่ดีที่สุดคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลด Save ลงเหลือ 5%',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'หาวิธีลด Needs เช่นแชร์ห้องหรือหารายได้เพิ่ม',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'กู้เงินมาเพิ่มรายได้',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ยอมรับว่าไม่สามารถออมได้ในตอนนี้',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'วางแผน Net Worth ให้โต 5 ปีแรก',
      description:
        '5 ปีแรกหลังเรียนจบเป็นช่วงสําคัญที่สุดในการสร้างรากฐาน Net Worth หากทําถูกต้องความมั่งคั่งจะเร่งตัวในภายหลัง',
      content:
        'แผน 5 ปีแรกสู่ Net Worth ที่แข็งแกร่ง : ปีที่ 1: สร้างรากฐาน → สร้าง Emergency Fund 3 เดือน (30,000-50,000 บาท ) → เริ่มชําระหนี้ดอกเบี้ยสูง ( บัตรเครดิต ) → เริ่มลงทุน DCA 1,000 บาท / เดือนปีที่ 2-3: ขยายการลงทุน → เพิ่ม DCA เป็น 3,000-5,000 บาท / เดือน → ชําระหนี้กยศ . ตามกําหนด → เพิ่มทักษะ → เพิ่มรายได้ปีที่ 4-5: สะสม → Net Worth ควรเป็นบวกแล้ว → เริ่มลงทุน RMF เพื่อลดหย่อนภาษี → วางแผนเป้าหมายใหญ่ ( บ้านเรียนต่อ ) เป้าหมาย : อายุ 30 ปี Net Worth อย่างน้อย 500,000 บาท',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 4,
      questions: [
        {
          questionText:
            'สิ่งแรกที่ควรทําด้าน Net Worth ในปีแรกที่ทํางานคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ซื้อบ้านทันทีเพื่อมีสินทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'สร้าง Emergency Fund และเริ่มชําระหนี้ดอกเบี้ยสูง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลงทุนหุ้นทั้งหมดเพื่อผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รอจน Net Worth เป็นบวกก่อนแล้วค่อยออม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมการเพิ่มทักษะในช่วง 5 ปีแรกทํางานจึงส่งผลต่อ Net Worth มาก ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะทําให้ได้โบนัสทุกปี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะรายได้ที่สูงขึ้นช่วยให้ออมและลงทุนได้มากขึ้นเร่ง Net Worth',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะนายจ้างให้ทุนการศึกษา',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'เพราะลดภาษีได้', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'ดอกเบี้ยเงินกู้ : รู้ก่อนกู้ 🌐 Financial Knowledge',
      description:
        'ดอกเบี้ยเงินกู้มีหลายประเภทและอัตราต่างกันมากรู้จักก่อนกู้ช่วยประหยัดได้เป็นแสนบาท',
      content:
        'ประเภทดอกเบี้ยเงินกู้ที่ควรรู้ : สินเชื่อบ้าน (Mortgage): ดอกเบี้ย ~3- 5% / ปี — ตํ่าสุดเพราะมีหลักทรัพย์คํ้าสินเชื่อรถ : ดอกเบี้ย ~2- 4% / ปี ( แต่เป็นแบบ Flat Rate ต่างกัน ) สินเชื่อส่วนบุคคล : ดอกเบี้ย ~10- 18% / ปี — สูงกว่าบ้านมากบัตรเครดิต : 16- 28% / ปี — สูงมากสินเชื่อนอกระบบ : 5- 20% / เดือน = 60- 240% / ปี — อันตราย ! ความแตกต่าง Flat Rate vs Effective Rate: → Flat Rate 2%: ดูเหมือนถูกแต่ Effective Rate จริงอาจ ~4% → ต้องเปรียบเทียบด้วย Effective Rate (APR) เสมอกฎง่ายๆ : ยิ่งมีหลักประกันน้อยดอกเบี้ยยิ่งสูง',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 4,
      questions: [
        {
          questionText: 'สินเชื่อประเภทใดมีดอกเบี้ยตํ่าที่สุดโดยทั่วไป ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'สินเชื่อส่วนบุคคล', isCorrect: false, orderNo: 1 },
              { choiceText: 'บัตรเครดิต', isCorrect: false, orderNo: 2 },
              {
                choiceText: 'สินเชื่อบ้านที่มีบ้านเป็นหลักประกัน',
                isCorrect: true,
                orderNo: 3,
              },
              { choiceText: 'สินเชื่อนอกระบบ', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทําไม " สินเชื่อนอกระบบ " จึงอันตรายมาก ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะผิดกฎหมายเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะดอกเบี้ยสูงมาก 60- 240% / ปีและมีการบังคับชําระที่รุนแรง',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะไม่มีสัญญา', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะธนาคารแห่งประเทศไทยไม่คุ้มครอง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W5: งบประมาณ 50/30/20',
      description:
        'สรุปและทบทวน Week 5 เรื่อง Budget และการจัดการเงินสําหรับวัยนักศึกษา',
      content:
        'สรุป Week 5 — Money Management 101: กฎ 50/30/20: Needs 50% | Wants 30% | Save & Invest 20% ขั้นตอน Budget Planner: บันทึก → แบ่งหมวด → ติดตาม → ปรับปรุง Net Worth = Assets − Liabilities: ต้องเพิ่มขึ้นทุกปีสินทรัพย์ vs หนี้สิน : สร้างสินทรัพย์ลดหนี้สินดอกเบี้ยสูงก่อน SMART Goal: ระบุชัดวัดได้ทําได้สอดคล้องมีกําหนดเวลา Emergency Fund: 3-6 เดือนของค่าใช้จ่าย → ต้องมีก่อนลงทุน DCA เบื้องต้น : ลงทุนเท่ากันทุกเดือนเฉลี่ยต้นทุนไม่ต้องเดาตลาด',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 5,
      questions: [
        {
          questionText:
            'จากกฎ 50/30/20 ถ้ารายได้ 20,000 บาทควรมีเงิน "Save & Invest" เดือนละเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '2,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '4,000 บาท', isCorrect: true, orderNo: 2 },
              { choiceText: '6,000 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '10,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'Emergency Fund ควรเก็บไว้ในรูปแบบใดเพื่อให้ใช้ได้ทันทีเมื่อฉุกเฉิน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นที่มีปริมาณซื้อขายสูง',
                isCorrect: false,
                orderNo: 1,
              },
              { choiceText: 'ทองคําแท่ง', isCorrect: false, orderNo: 2 },
              {
                choiceText: 'บัญชีออมทรัพย์หรือกองทุนตลาดเงิน',
                isCorrect: true,
                orderNo: 3,
              },
              { choiceText: 'กองทุน RMF', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W5: SMART Goal และ Net Worth',
      description:
        'ทบทวน SMART Goal และการติดตาม Net Worth ซึ่งเป็นเครื่องมือสําคัญสองชิ้นในการวางแผนการเงิน',
      content:
        'ทบทวน SMART Goal: S = Specific: " ออมเงิน 30,000 บาทสําหรับฉุกเฉิน " M = Measurable: "1,500 บาท / เดือนตรวจสอบทุกสิ้นเดือน " A = Achievable: " รายได้ 15,000 บาทออม 10% = 1,500 ทําได้ " R = Relevant: " ต้องมีก่อนลงทุนเพราะป้องกันการขาดทุนฉุกเฉิน " T = Time-bound: " ภายใน 20 เดือน " ทบทวน Net Worth Tracking: → คํานวณทุก 6 เดือน → บันทึกในสเปรดชีต → วิเคราะห์ว่าสินทรัพย์ไหนเพิ่มหนี้ไหนลด → ปรับแผนถ้าไม่เป็นไปตามเป้า',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 5,
      questions: [
        {
          questionText: 'ใน SMART Goal ตัว "T" สําคัญอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText:
                  'ทําให้มีแรงจูงใจและสามารถคํานวณเงินที่ต้องออมต่อเดือนได้',
                isCorrect: true,
                orderNo: 1,
              },
              {
                choiceText: 'ทําให้แผนดูน่าเชื่อถือ',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText: 'ทําให้ธนาคารให้ดอกเบี้ยพิเศษ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ทําให้ได้รับการยกเว้นภาษี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ควรคํานวณ Net Worth บ่อยแค่ไหน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทุกวันเพราะราคาหุ้นเปลี่ยนทุกวัน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ทุก 6-12 เดือนเพื่อติดตามความก้าวหน้า',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เฉพาะตอนจะกู้เงิน', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ไม่ต้องทําเพราะธนาคารทําให้',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'งบประมาณ : กรณีศึกษาวิกฤต',
      description:
        'เมื่อแผนงบประมาณพังเพราะเหตุฉุกเฉินต้องรับมืออย่างไรโดยไม่ก่อหนี้เพิ่ม',
      content:
        'กรณีศึกษา : นักศึกษาชั้นปี 3 เจอวิกฤตทางการเงินสถานการณ์ : โน้ตบุ๊กเสียต้องซ่อม 8,000 บาทแต่ Emergency Fund มีแค่ 5,000 บาทขาด 3,000 บาท — ทําอย่างไร ? ตัวเลือกที่ดี : → ใช้ Emergency Fund 5,000 + หยุด Want ทั้งหมด 2 เดือน = ได้ส่วนที่ขาด → ขายสิ่งของที่ไม่จําเป็น → ขอยืมพ่อแม่ ( ไม่มีดอกเบี้ย ) แล้วคืนโดยเร็วตัวเลือกที่แย่ : → รูดบัตรเครดิต 8,000 บาทแล้วจ่ายแค่ขั้นตํ่า ( ดอกเบี้ย 20%) → กู้นอกระบบบทเรียน : Emergency Fund ทําให้วิกฤตเป็นแค่ " ความไม่สะดวก " ไม่ใช่ " หายนะ "',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 5,
      questions: [
        {
          questionText:
            'จากกรณีศึกษาทําไมการรูดบัตรเครดิตและจ่ายแค่ขั้นตํ่าจึงเป็นตัวเลือกที่แย่ที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะไม่สามารถซ่อมโน้ตบุ๊กได้',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะดอกเบี้ย 20% ทําให้หนี้ 8,000 กลายเป็นหมื่นกว่าบาทในเวลาสั้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะผิดนโยบายมหาวิทยาลัย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะธนาคารไม่อนุมัติ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'Emergency Fund มีผลต่อชีวิตทางการเงินอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทําให้ไม่ต้องทํางานพิเศษ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เปลี่ยนวิกฤตทางการเงินให้เป็นแค่ความไม่สะดวกแทนที่จะต้องก่อหนี้ใหม่',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ทําให้ได้ดอกเบี้ยสูงกว่าบัญชีปกติ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ทําให้สามารถลงทุนในหุ้นได้มากขึ้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ประกันสังคมกรณีชราภาพ : เงินเกษียณจากรัฐ 🌐 Financial Knowledge',
      description:
        'นอกจากออมเองแล้วคนทํางานยังได้รับเงินชราภาพจากประกันสังคมด้วยรู้เงื่อนไขช่วยวางแผนเกษียณได้ดีขึ้น',
      content:
        'ประกันสังคมกรณีชราภาพ : สิทธิ์สําหรับผู้ประกันตนเงื่อนไขรับบํานาญ : ส่งเงินสมทบ ≥ 180 เดือน (15 ปี ) และอายุ ≥ 55 ปีบํานาญรายเดือน : 20% ของค่าจ้างเฉลี่ย + 1.5% ต่อทุก 12 เดือนที่ส่งเกิน 180 เดือนตัวอย่าง : ส่งประกันสังคม 30 ปีเงินเดือนเฉลี่ย 25,000 บาท → บํานาญ = 20% × 25,000 + (1.5% × 15 ปีที่เกิน × 25,000) → = 5,000 + 5,625 = 10,625 บาท / เดือนหมายเหตุ : เงินบํานาญจากประกันสังคมอาจไม่เพียงพอ → ต้องออมและลงทุนเพิ่มเองถ้าส่งไม่ถึง 180 เดือน : ได้เป็นบําเหน็จ ( ก้อนเดียว ) แทน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 5,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ต้องส่งเงินสมทบประกันสังคมกี่เดือนจึงจะได้รับ " บํานาญ " รายเดือน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '60 เดือน (5 ปี )', isCorrect: false, orderNo: 1 },
              {
                choiceText: '120 เดือน (10 ปี )',
                isCorrect: false,
                orderNo: 2,
              },
              { choiceText: '180 เดือน (15 ปี )', isCorrect: true, orderNo: 3 },
              {
                choiceText: '240 เดือน (20 ปี )',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมเงินบํานาญจากประกันสังคมเพียงอย่างเดียวอาจไม่เพียงพอสําหรับการเกษียณ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะประกันสังคมล้มละลายทุก 10 ปี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเงินบํานาญอาจน้อยกว่าค่าครองชีพจริงจําเป็นต้องออมและลงทุนเพิ่มเติม',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะต้องแบ่งให้ลูกหลาน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะรัฐบาลเก็บภาษีบํานาญสูงมาก',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ทําไมเงินฝากธนาคารไม่พอ ?',
      description:
        'ดอกเบี้ยเงินฝาก 1.5% / ปี vs เงินเฟ้อ 2- 3% / ปีหมายความว่าเงินที่ฝากไว้มีมูลค่าจริงลดลงทุกปี',
      content:
        'ปัญหาของการฝากธนาคารเพียงอย่างเดียว : ดอกเบี้ยออมทรัพย์ : ~1. 5% / ปีเงินเฟ้อเฉลี่ย : ~2- 3% / ปีผลลัพธ์ : กําลังซื้อลดลงจริง 0.5- 1.5% / ปีแม้ตัวเลขเพิ่มขึ้น ! ตัวอย่างเงิน 100,000 บาทหลัง 10 ปี : → ฝากธนาคาร 1.5%: 116,054 บาท ( ตัวเลข ) → แต่ข้าวหม้อที่ซื้อได้ลดลงเพราะเงินเฟ้อ 2.5% / ปี → ต้องมี 128,008 บาทถึงจะซื้อของได้เท่าเดิม → จริงๆแล้วขาดทุน ! ขาดกําลังซื้อ 11,954 บาทผลตอบแทนสินทรัพย์จาก SET: → เงินฝาก : 1.9% / ปี → 48 ปีเงินเป็น 2 เท่า → กองทุนรวม : 4- 8% / ปี → 9-18 ปีเงินเป็น 2 เท่า → หุ้น SET TRI: ~8. 9% / ปี → 8 ปีเงินเป็น 2 เท่า',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 1,
      questions: [
        {
          questionText:
            'ทําไมดอกเบี้ยเงินฝาก 1.5% / ปีจึง " ไม่พอ " ทั้งที่ตัวเลขเพิ่มขึ้นจริง ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะธนาคารเก็บค่าธรรมเนียมเพิ่ม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเงินเฟ้อสูงกว่าดอกเบี้ยทําให้กําลังซื้อจริงลดลง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะดอกเบี้ยต้องเสียภาษีทั้งหมด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะธนาคารนําเงินไปลงทุนอื่น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'หุ้น SET TRI ให้ผลตอบแทนเฉลี่ยประมาณเท่าไหร่ต่อปี ( อ้างอิง SET)?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: '3-4%', isCorrect: false, orderNo: 1 },
              { choiceText: '5-6%', isCorrect: false, orderNo: 2 },
              { choiceText: '8.9%', isCorrect: true, orderNo: 3 },
              { choiceText: '15-20%', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'ผลตอบแทนและความเสี่ยงของสินทรัพย์',
      description:
        'ทุกการลงทุนมีความสัมพันธ์ระหว่างผลตอบแทนและความเสี่ยง — เข้าใจหลักนี้ก่อนตัดสินใจลงทุน',
      content:
        'หลักพื้นฐาน : ผลตอบแทนสูง = ความเสี่ยงสูงเสมอตารางผลตอบแทนเฉลี่ย vs ความเสี่ยง : เงินฝาก : ~1. 9% / ปี | ความเสี่ยง : ตํ่ามาก | เหมาะ : เงินฉุกเฉินพันธบัตรรัฐบาล : ~4. 5% / ปี | ความเสี่ยง : ตํ่า | เหมาะ : ระยะกลางกองทุนตราสารหนี้ : ~3- 5% / ปี | ความเสี่ยง : ตํ่า - กลางทองคํา : ~7. 8% / ปี | ความเสี่ยง : ปานกลางกองทุนหุ้น : ~6- 9% / ปี | ความเสี่ยง : สูง | เหมาะ : ระยะยาว 5+ ปีหุ้นรายตัว : 0%-∞ | ความเสี่ยง : สูงมาก Crypto: ผันผวนมาก | ความเสี่ยง : สูงมากหลักการเลือก : ระยะเวลายาวขึ้น → รับความเสี่ยงได้มากขึ้น',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 1,
      questions: [
        {
          questionText:
            'นักลงทุนที่ต้องการเงินใน 2 ปีควรเลือกสินทรัพย์ประเภทใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นรายตัวที่ผันผวนสูง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'กองทุนตลาดเงินหรือตราสารหนี้ระยะสั้น',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'Cryptocurrency', isCorrect: false, orderNo: 3 },
              { choiceText: 'กองทุนหุ้น 100%', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            '" ผลตอบแทนสูงความเสี่ยงสูง " หมายความว่าอะไรในทางปฏิบัติ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ยิ่งเสี่ยงยิ่งได้กําไรเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'สินทรัพย์ผลตอบแทนสูงมีโอกาสขาดทุนมากกว่าแต่ในระยะยาวมักให้ผลตอบแทนดีกว่า',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่ควรลงทุนในสินทรัพย์เสี่ยงเลย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ผลตอบแทนสูงหมายถึงไม่มีความเสี่ยง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Rule of 72 ในชีวิตจริง',
      description:
        'Rule of 72 ไม่ใช่แค่สูตรในหนังสือแต่เป็นเครื่องมือที่ใช้ตัดสินใจลงทุนจริงได้ทันที',
      content:
        'Rule of 72: ปีที่เงินเป็น 2 เท่า = 72 ÷ อัตราผลตอบแทน (%) เปรียบเทียบสินทรัพย์ : → เงินฝาก 1.5%: 72 ÷ 1.5 = 48 ปี → กองทุนผสม 5%: 72 ÷ 5 = 14.4 ปี → กองทุนหุ้น 8%: 72 ÷ 8 = 9 ปี → หุ้น SET TRI 9%: 72 ÷ 9 = 8 ปีใช้ Rule of 72 กลับทาง : อยากให้เงินเป็น 2 เท่าใน 10 ปีต้องการผลตอบแทนเท่าไหร่ ? → 72 ÷ 10 = 7.2% ต่อปีประยุกต์ใช้ : ถ้าต้องการเงิน 1,000,000 บาทตอนอายุ 60 ปีเริ่มอายุ 30 ปี (30 ปี ) → ผลตอบแทน 7% → เงินเป็น 2 เท่าทุก ~10 ปี → 100,000 บาทจะกลายเป็น 800,000+ บาท',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 1,
      questions: [
        {
          questionText:
            'ถ้าต้องการให้เงินเป็น 2 เท่าใน 9 ปีต้องการผลตอบแทนประมาณเท่าไหร่ต่อปี ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '4% ต่อปี', isCorrect: false, orderNo: 1 },
              { choiceText: '6% ต่อปี', isCorrect: false, orderNo: 2 },
              { choiceText: '8% ต่อปี', isCorrect: true, orderNo: 3 },
              { choiceText: '10% ต่อปี', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'Rule of 72 บอกว่าเงินฝากธนาคาร 1.5% / ปีต้องใช้เวลากี่ปีเงินจึงเป็น 2 เท่า ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: '24 ปี', isCorrect: false, orderNo: 1 },
              { choiceText: '36 ปี', isCorrect: false, orderNo: 2 },
              { choiceText: '48 ปี', isCorrect: true, orderNo: 3 },
              { choiceText: '60 ปี', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'กนง . ดอกเบี้ยนโยบาย : ส่งผลต่อทุกอย่าง 🌐 Financial Knowledge',
      description:
        'คณะกรรมการนโยบายการเงิน ( กนง .) กําหนดดอกเบี้ยนโยบายซึ่งส่งผลถึงดอกเบี้ยเงินฝากเงินกู้และตลาดหุ้นทั้งหมด',
      content:
        'กนง . ( คณะกรรมการนโยบายการเงิน ) ทําหน้าที่อะไร ? กําหนดอัตราดอกเบี้ยนโยบาย (Policy Rate) ของธนาคารแห่งประเทศไทยประชุม 8 ครั้ง / ปีและประกาศผลซึ่งส่งผลต่อตลาดการเงินทันทีกนง . ขึ้นดอกเบี้ย → ผลกระทบ : → ดอกเบี้ยเงินฝากขึ้น ( ดีสําหรับผู้ฝาก ) → ดอกเบี้ยเงินกู้ขึ้น ( แย่สําหรับผู้กู้ ) → ตลาดหุ้นมักปรับตัวลง ( ต้นทุนทุนสูงขึ้น ) → ราคาพันธบัตรเก่าลดลง ( เพราะ yield ใหม่สูงกว่า ) กนง . ลดดอกเบี้ย → ผลตรงข้ามตลาดหุ้นมักขึ้น 2022-2024: กนง . ขึ้นดอกเบี้ยเพื่อสกัดเงินเฟ้อทั่วโลก',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 1,
      questions: [
        {
          questionText: 'เมื่อกนง . ขึ้นดอกเบี้ยนโยบายผลที่เกิดทันทีคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ตลาดหุ้นปรับตัวขึ้นเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ดอกเบี้ยเงินฝากและเงินกู้มีแนวโน้มปรับสูงขึ้นตลาดหุ้นมักปรับตัวลง',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เงินเฟ้อเพิ่มขึ้น', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ค่าเงินบาทอ่อนลงทันที',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ทําไมกนง . จึงขึ้นดอกเบี้ยนโยบายในช่วงปี 2022-2024?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพื่อกระตุ้นเศรษฐกิจที่ซบเซา',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพื่อสกัดเงินเฟ้อที่สูงขึ้นหลัง COVID-19 และวิกฤตพลังงาน',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพื่อลดค่าเงินบาท', isCorrect: false, orderNo: 3 },
              { choiceText: 'เพราะสหรัฐฯบังคับ', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'หุ้นคืออะไร : เป็นเจ้าของส่วนหนึ่ง',
      description:
        'การซื้อหุ้นคือการเป็นเจ้าของส่วนหนึ่งของบริษัทเมื่อบริษัทเติบโตผู้ถือหุ้นก็ได้ประโยชน์ด้วย',
      content:
        'หุ้น (Stock/Share) คืออะไร : หลักฐานแสดงความเป็นเจ้าของส่วนหนึ่งของบริษัทที่จดทะเบียนในตลาดหลักทรัพย์ผลตอบแทนจากหุ้น 2 ทาง : 1. กําไรจากส่วนต่างราคา (Capital Gain): → ซื้อ 100 บาท / หุ้นขาย 130 บาท = กําไร 30 บาท / หุ้น 2. เงินปันผล (Dividend): → บริษัทแบ่งกําไรให้ผู้ถือหุ้นปีละ 1-2 ครั้ง → ตัวอย่าง : ถือหุ้น 1,000 หุ้นได้ปันผล 2 บาท / หุ้น = 2,000 บาทราคาหุ้นขึ้นอยู่กับ : ผลประกอบการ + ความเชื่อมั่นนักลงทุน + ภาวะตลาดข้อควรรู้ : ผู้ถือหุ้นสามัญมีสิทธิ์โหวตในที่ประชุมผู้ถือหุ้น',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 2,
      questions: [
        {
          questionText: 'ผลตอบแทนจากหุ้นมี 2 ทางข้อใดกล่าวถูกต้อง ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ดอกเบี้ยและค่าเช่า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กําไรส่วนต่างราคา (Capital Gain) และเงินปันผล (Dividend)',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'บํานาญและโบนัส', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ดอกเบี้ยทบต้นและค่าธรรมเนียม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ถ้าถือหุ้น CPALL จํานวน 500 หุ้นและบริษัทจ่ายปันผล 1.50 บาท / หุ้นจะได้รับปันผลเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: '150 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '500 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '750 บาท', isCorrect: true, orderNo: 3 },
              { choiceText: '1,500 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'ลักษณะหุ้นที่ดีสําหรับนักลงทุนระยะยาว',
      description:
        'SET แนะนํา 4 เกณฑ์ในการเลือกหุ้นสําหรับการลงทุนระยะยาวเรียนรู้ไว้จะช่วยกรองหุ้นได้ดีขึ้น',
      content:
        '4 เกณฑ์เลือกหุ้นระยะยาว (WMD1401): 1. ธุรกิจดีมีโอกาสเติบโต : → อยู่ในอุตสาหกรรมที่มีอนาคต → ตัวอย่าง : AOT ( สนามบิน ), CPALL ( สะดวกซื้อ ) 2. การเงินมั่นคง : → หนี้ตํ่ากระแสเงินสดดีงบการเงินแข็งแกร่ง → ตัวอย่าง : BBL, SCB 3. กําไรสมํ่าเสมอจ่ายปันผลต่อเนื่อง : → กําไรเติบโตต่อเนื่องจ่ายปันผลทุกปี → ตัวอย่าง : BDMS, CPN 4. ธรรมาภิบาลดี : → ผู้บริหารโปร่งใสไม่มีประวัติฉ้อโกง → ตรวจสอบที่ www.set.or.th และรายงาน CGR สิ่งที่ต้องหลีกเลี่ยง : หุ้นที่กําไรผิดปกติสูงหุ้น Penny ไม่มีประวัติ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 2,
      questions: [
        {
          questionText:
            'เกณฑ์ใดสําคัญที่สุดในการเลือกหุ้นสําหรับนักลงทุนระยะยาว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ราคาหุ้นตํ่าที่สุดในกลุ่ม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ผลประกอบการดีการเงินมั่นคงธรรมาภิบาลและโอกาสเติบโต',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ปริมาณซื้อขายสูงสุดในวัน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'หุ้นที่นักวิเคราะห์แนะนํา " ซื้อ " มากที่สุด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมธรรมาภิบาล (Corporate Governance) ของบริษัทจึงสําคัญสําหรับนักลงทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะบริษัทที่มีธรรมาภิบาลดีไม่ต้องเสียภาษี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะผู้บริหารที่โปร่งใสมีโอกาสน้อยที่จะเบียดบังผลประโยชน์ผู้ถือหุ้น',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะ SET บังคับ', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะทําให้ราคาหุ้นสูงกว่าตลาดเสมอ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Risk vs Return: หลักเลือกลงทุน',
      description:
        'ทุกการลงทุนต้องตอบคําถามสําคัญ 3 ข้อ : รับความเสี่ยงได้แค่ไหน ? ต้องการเงินเมื่อไหร่ ? มีเป้าหมายอะไร ?',
      content:
        'การประเมินความเสี่ยงส่วนตัวก่อนลงทุน : 1. Risk Capacity ( ความสามารถรับความเสี่ยง ): มีฐานะการเงินแข็งแกร่งพอไหม ? → ถ้าสินทรัพย์ลด 30% จะกระทบชีวิตแค่ไหน ? 2. Risk Tolerance ( ความทนทานต่อความเสี่ยง ): จิตใจรับได้แค่ไหน ? → ถ้าพอร์ตลด 20% จะ panic sell ไหม ? 3. Time Horizon ( ระยะเวลาลงทุน ): ต้องใช้เงินเมื่อไหร่ ? → ยาวกว่า 5 ปี → รับความเสี่ยงสูงได้ → น้อยกว่า 2 ปี → ความเสี่ยงตํ่าเท่านั้น Diversification ( การกระจายความเสี่ยง ): → ไม่ใส่ไข่ทั้งหมดในตะกร้าเดียว → กระจายในหลายสินทรัพย์ลดความผันผวน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 2,
      questions: [
        {
          questionText:
            '"Time Horizon" ในการลงทุนหมายถึงอะไรและส่งผลต่อการเลือกสินทรัพย์อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เวลาที่ใช้วิเคราะห์หุ้นต่อวัน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ระยะเวลาที่วางแผนจะถือสินทรัพย์ — ยาวกว่าสามารถรับความเสี่ยงสูงได้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เวลาทําการของตลาดหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'อายุของนักลงทุน', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'นักศึกษาที่วางแผนลงทุนเพื่อเกษียณอีก 35 ปีควรเลือกสินทรัพย์แบบใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เงินฝากออมทรัพย์ 100% เพราะปลอดภัย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กองทุนหุ้นสัดส่วนสูงเพราะระยะยาวพอรับความผันผวนได้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ทองคํา 100% เพราะค่าคงที่',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'Cryptocurrency เพราะผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ประกันชีวิตสะสมทรัพย์ : ออมหรือลงทุน ? 🌐 Financial Knowledge',
      description:
        'ประกันชีวิตสะสมทรัพย์ดูน่าสนใจแต่ควรเปรียบเทียบกับทางเลือกอื่นก่อนตัดสินใจ',
      content:
        'ประกันชีวิตสะสมทรัพย์ (Endowment): รูปแบบ : จ่ายเบี้ยทุกปีหลังครบกําหนด (10-20 ปี ) รับเงินคืนพร้อมผลตอบแทนข้อดี : → บังคับออม — จ่ายเบี้ยทุกปีไม่งั้นขาดทุน → คุ้มครองชีวิตด้วยในระหว่างทาง → ลดหย่อนภาษีได้สูงสุด 100,000 บาท / ปีข้อเสีย : → ผลตอบแทนตํ่า : ~2- 3% / ปีเท่านั้น → ยกเลิกก่อนครบกําหนด = เสียเงินมาก → ไม่ยืดหยุ่นเมื่อเทียบกับกองทุนรวมเปรียบเทียบ : ประกัน 2% vs กองทุนหุ้น 8% → เงิน 1,000 บาท / เดือน 20 ปี : → ประกัน : ~292,000 บาท → กองทุน 8%: ~587,000 บาท ( เกือบ 2 เท่า !)',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 2,
      questions: [
        {
          questionText: 'ข้อดีที่สําคัญที่สุดของประกันชีวิตสะสมทรัพย์คืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ผลตอบแทนสูงกว่ากองทุนรวม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'บังคับออมและลดหย่อนภาษีได้พร้อมคุ้มครองชีวิต',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ถอนได้ทุกเวลาโดยไม่มีเงื่อนไข',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รัฐบาลคํ้าประกันผลตอบแทน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมบางคนแนะนําให้ " แยก " ระหว่างประกันและการลงทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'เพราะกฎหมายบังคับ', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'เพราะผลตอบแทนประกันตํ่าซื้อประกันเฉพาะส่วนคุ้มครองแล้วนําส่วนที่เหลือลงทุนกองทุนได้ผลตอบแทนดีกว่า',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะประกันไม่ปลอดภัย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะบริษัทประกันไม่น่าเชื่อถือ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กองทุนรวม : ลงทุนง่ายสําหรับมือใหม่',
      description:
        'กองทุนรวมคือทางเลือกที่ดีที่สุดสําหรับนักลงทุนมือใหม่ที่ต้องการผลตอบแทนดีกว่าเงินฝากโดยไม่ต้องเลือกหุ้นเอง',
      content:
        'กองทุนรวม (Mutual Fund) = รวมเงินหลายคนให้ผู้เชี่ยวชาญบริหารข้อดี 5 ประการ (WMD1401): 1. บริหารโดยผู้เชี่ยวชาญ : ไม่ต้องวิเคราะห์หุ้นเอง 2. กระจายความเสี่ยง : เงิน 1,000 บาทลงทุนหลายหุ้นพร้อมกัน 3. หลากหลายให้เลือก : ตั้งแต่ความเสี่ยงตํ่าถึงสูง 4. สภาพคล่องสูง : ขายคืนได้ใน 3-5 วันทําการ 5. ลดหย่อนภาษี : กองทุน RMF/SSF ช่วยลดภาษีได้ประเภทกองทุน : → ตลาดเงิน : เสี่ยงตํ่า ~1-2% → ตราสารหนี้ : เสี่ยงตํ่า - กลาง ~3-5% → ผสม : เสี่ยงกลาง ~4-7% → หุ้น : เสี่ยงสูง ~6-10% → Index Fund: ติดตาม SET50/SET100 ค่าธรรมเนียมตํ่า',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 3,
      questions: [
        {
          questionText: 'ข้อใดคือข้อดีหลักของกองทุนรวมสําหรับนักลงทุนมือใหม่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ผลตอบแทนสูงกว่าลงทุนหุ้นเองเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กระจายความเสี่ยงและมีผู้เชี่ยวชาญดูแลไม่ต้องวิเคราะห์หุ้นเอง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่มีความเสี่ยงและรับประกันผลตอบแทน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ถอนเงินได้ทันทีตลอด 24 ชั่วโมง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'กองทุน Index Fund ต่างจากกองทุนหุ้นทั่วไปอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'ไม่มีความเสี่ยง', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'ลงทุนตามดัชนีเช่น SET50 โดยอัตโนมัติค่าธรรมเนียมตํ่ากว่า',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ผลตอบแทนสูงกว่าเสมอ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เหมาะเฉพาะนักลงทุนรายใหญ่',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'DCA กับกองทุน : คํานวณผลจริง',
      description:
        'ดูตัวเลขจริงของ DCA กับกองทุนรวมเพื่อให้เห็นภาพชัดเจนว่าทําไม DCA ถึงได้ผลในระยะยาว',
      content:
        'ตัวอย่าง DCA กองทุน 12 เดือน (WMD1401): ลงทุน 2,000 บาท / เดือนทุกวันที่ 1: เดือน 1: NAV 10 บาท → 200 หน่วยเดือน 2: NAV 9.25 บาท → 216 หน่วย ( ตลาดลงซื้อได้มากขึ้น ) เดือน 3: NAV 8.00 บาท → 250 หน่วยเดือน 4: NAV 9.00 บาท → 222 หน่วยเดือน 5: NAV 9.50 บาท → 210 หน่วยเดือน 6: NAV 10.50 บาท → 190 หน่วยรวม : ลงทุน 12,000 บาทได้ 1,288 หน่วยต้นทุนเฉลี่ย : 12,000 ÷ 1,288 = 9.32 บาท ( ตํ่ากว่าราคาเฉลี่ย 9.71 บาท !) มูลค่าสิ้นปี (NAV 10.50): 1,288 × 10.50 = 13,524 บาทผลตอบแทน : (13,524 - 12,000) ÷ 12,000 = 12.7% ใน 6 เดือน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 3,
      questions: [
        {
          questionText: 'ทําไม DCA จึงได้ต้นทุนเฉลี่ยตํ่ากว่าราคาเฉลี่ยจริง ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะลงทุนแค่เดือนที่ราคาตํ่า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเดือนที่ราคาตํ่าซื้อได้หน่วยมากดึงต้นทุนเฉลี่ยลง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะผู้จัดการกองทุนลดราคาให้',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะคํานวณแบบพิเศษ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'DCA ในช่วงตลาดขาลง ( ราคากองทุนลด ) ควรทําอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หยุด DCA และรอให้ตลาดฟื้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'DCA ต่อตามแผนเพราะซื้อได้หน่วยมากขึ้นในราคาถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพิ่มจํานวนเงิน DCA เป็น 2 เท่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ขายกองทุนทั้งหมดออกก่อน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ประเภทสินทรัพย์เพื่อการลงทุน',
      description:
        'นักลงทุนที่ดีต้องรู้จักสินทรัพย์แต่ละประเภทเพื่อจัดพอร์ตให้สมดุลกับความเสี่ยงและเป้าหมาย',
      content:
        'สินทรัพย์หลักสําหรับนักลงทุนรายย่อย : 1. เงินฝาก / ตลาดเงิน : ~1.5-2% | ความเสี่ยงตํ่าสุด 2. พันธบัตรรัฐบาล / ตราสารหนี้ : ~3-5% | ความเสี่ยงตํ่า 3. ทองคํา : ~5-8% ในระยะยาว | ป้องกันเงินเฟ้อแต่ไม่มีปันผล 4. กองทุนรวมหุ้น : ~6-9% ระยะยาว | ความเสี่ยงปานกลาง - สูง 5. หุ้นรายตัว : ~0-30%+ | ความเสี่ยงสูงต้องมีความรู้ 6. อสังหาริมทรัพย์ : ค่าเช่า + มูลค่าเพิ่ม | ต้องใช้เงินมาก 7. Cryptocurrency: ผันผวนมาก | เก็งกําไรสูงความเสี่ยงสูงสุดหลักการ Asset Allocation: ระยะสั้น = ความเสี่ยงตํ่า , ระยะยาว = ความเสี่ยงสูงได้',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 3,
      questions: [
        {
          questionText: 'สินทรัพย์ใดทําหน้าที่ป้องกันเงินเฟ้อได้ดีในระยะยาว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'เงินสดในบ้าน', isCorrect: false, orderNo: 1 },
              { choiceText: 'เงินฝากออมทรัพย์', isCorrect: false, orderNo: 2 },
              { choiceText: 'ทองคําและหุ้น', isCorrect: true, orderNo: 3 },
              { choiceText: 'พันธบัตรระยะสั้น', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'นักลงทุนมือใหม่ที่ต้องการเริ่มพอร์ตควรเริ่มจากสินทรัพย์ใดก่อน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นรายตัวที่มีผลตอบแทนสูง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กองทุนรวมที่กระจายความเสี่ยงแล้วก่อนศึกษาลงทุนในสินทรัพย์ที่ซับซ้อนขึ้น',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'Cryptocurrency', isCorrect: false, orderNo: 3 },
              { choiceText: 'อสังหาริมทรัพย์', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'หนี้บัตรเครดิต : ดอกเบี้ยทบต้นที่เจ็บปวด 🌐 Financial Knowledge',
      description:
        'หนี้บัตรเครดิตเป็นตัวอย่างดอกเบี้ยทบต้นที่ " ทํางานสวนทาง " กับคุณ — ยิ่งจ่ายช้ายิ่งเพิ่มเร็ว',
      content:
        'ความน่ากลัวของดอกเบี้ยบัตรเครดิต : อัตราดอกเบี้ย : 16- 28% / ปี ( เฉลี่ย ~20%) ถ้าค้างชําระ 10,000 บาทและจ่ายแค่ขั้นตํ่า 5%: → เดือน 1: ยอดค้าง 9,666 บาท ( จ่าย 500, ดอก 167) → ปี 1: ยอดค้างยังเกิน 8,000 บาท ! → จะใช้เวลา ~5 ปีและจ่ายดอก ~6,000+ บาทกว่าจะหมด 10,000 บาทกลายเป็น 16,000 บาทโดยที่ไม่ได้ซื้ออะไรเพิ่มเลย ! วิธีแก้ : → ชําระเต็มจํานวนก่อนครบกําหนด → ถ้าจ่ายไม่ได้เต็มให้จ่ายมากที่สุดเท่าที่ทําได้ → พิจารณาสินเชื่อดอกเบี้ยตํ่ามาชําระทดแทน (Refinance)',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 3,
      questions: [
        {
          questionText:
            'ถ้าค้างบัตรเครดิต 10,000 บาทและจ่ายแค่ขั้นตํ่าผลลัพธ์ในระยะยาวคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'หมดหนี้ใน 1 ปี', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'จ่ายดอกเบี้ยเพิ่มหลายพันบาทและใช้เวลาหลายปีกว่าจะหมด',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ธนาคารยกหนี้ให้หลัง 3 ปี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ดอกเบี้ยถูกจํากัดไม่เกิน 1,000 บาท',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'วิธีที่ดีที่สุดในการหลีกเลี่ยงหนี้บัตรเครดิตคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ไม่ใช้บัตรเครดิตเลย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ชําระเต็มจํานวนทุกเดือนก่อนครบกําหนดเพื่อไม่มีดอกเบี้ย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขอขยายวงเงินให้สูงขึ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ใช้หลายบัตรเพื่อกระจาย',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'เริ่มลงทุนด้วยเงินน้อย',
      description:
        'ไม่ต้องรอมีเงินมากก่อนลงทุนเริ่มด้วย 500-1,000 บาทก็ได้ที่สําคัญคือเริ่มเร็วและสมํ่าเสมอ',
      content:
        'เริ่มลงทุนด้วยเงินน้อยทําได้จริง : กองทุนรวม : → เริ่มต้น : 500-1,000 บาท ( บางกองทุนเริ่ม 1 บาท ) → DCA รายเดือน : 500-1,000 บาท / เดือน → ช่องทาง : แอปธนาคาร , Finnomena, Jitta Wealth หุ้น ( ผ่านโครงการออมหุ้น ): → เริ่มต้นด้วยโครงการ DCA หุ้นผ่านบล . ต่างๆ → เริ่มต้น 1,000 บาท / เดือนซื้อได้เศษหุ้นตัวอย่างพลังของเงินน้อย + เวลา : → DCA 500 บาท / เดือน @ 8% / ปีเป็นเวลา 30 ปี = 679,699 บาท → ลงทุนรวมแค่ 180,000 บาทแต่ได้ 679,699 บาท ! ข้อสําคัญ : อย่ารอ " มีเงินมากพอ " — เวลาคือสินทรัพย์ที่มีค่าที่สุด',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 4,
      questions: [
        {
          questionText:
            'DCA 500 บาท / เดือนที่ผลตอบแทน 8% / ปีเป็นเวลา 30 ปีจะได้เงินประมาณเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: '180,000 บาท ( เงินที่ลงทุนจริง )',
                isCorrect: false,
                orderNo: 1,
              },
              { choiceText: '~350,000 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '~680,000 บาท', isCorrect: true, orderNo: 3 },
              { choiceText: '~1,200,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทําไมควรเริ่มลงทุนโดยเร็วแม้มีเงินน้อย ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะค่าธรรมเนียมตํ่ากว่าเมื่อลงทุนน้อย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเวลาทําให้ดอกเบี้ยทบต้นทํางานยิ่งเริ่มเร็วเงินยิ่งเพิ่มมากกว่า',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะกองทุนรวมมีขีดจํากัดจํานวนผู้ลงทุน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะรัฐบาลให้สิทธิ์พิเศษผู้ลงทุนน้อย',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กองทุนรวม vs หุ้นตรง : เลือกอะไรดี ?',
      description:
        'คําถามสําคัญสําหรับนักลงทุนมือใหม่ : เลือกกองทุนรวมหรือหุ้นรายตัว ? แต่ละแบบเหมาะกับใคร ?',
      content:
        'เปรียบเทียบกองทุนรวม vs หุ้นรายตัว : กองทุนรวม : → ข้อดี : บริหารโดยผู้เชี่ยวชาญกระจายเสี่ยงอัตโนมัติใช้เวลาน้อย → ข้อเสีย : มีค่าธรรมเนียมบริหาร (TER ~0. 5- 2% / ปี ) ผลตอบแทนสูงสุดจํากัด → เหมาะกับ : มือใหม่คนไม่มีเวลาต้องการ Diversification หุ้นรายตัว : → ข้อดี : ไม่มีค่าธรรมเนียมบริหารอาจได้ผลตอบแทนสูงกว่าตลาด → ข้อเสีย : ต้องวิเคราะห์เองความเสี่ยงสูงกว่าต้องใช้เวลาและความรู้ → เหมาะกับ : มีเวลามีความรู้ลงทุนมาสักพักแล้วแนะนําสําหรับนักศึกษา : เริ่มจากกองทุน Index Fund ก่อนแล้วค่อยศึกษาหุ้นรายตัว',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 4,
      questions: [
        {
          questionText:
            'นักลงทุนมือใหม่ควรเริ่มจากอะไรก่อนระหว่างกองทุนรวมและหุ้นรายตัว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นรายตัวเพราะไม่มีค่าธรรมเนียม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กองทุนรวมเพราะผู้เชี่ยวชาญดูแลกระจายเสี่ยงดีลดความผิดพลาด',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Cryptocurrency เพราะผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ทองคําเพราะปลอดภัยสุด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ค่าธรรมเนียม TER (Total Expense Ratio) ของกองทุนส่งผลต่อนักลงทุนอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ไม่มีผลต่อผลตอบแทน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ถูกหักออกจากผลตอบแทนทุกปียิ่งสูงยิ่งลดผลตอบแทนสุทธิ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'จ่ายครั้งเดียวตอนซื้อ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รัฐบาลคืนให้ทั้งหมด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Diversification: อย่าใส่ไข่ทั้งหมดในตะกร้าเดียว',
      description:
        'การกระจายความเสี่ยงคือหลักพื้นฐานของการลงทุนที่ดีช่วยลดความเสี่ยงโดยไม่ต้องลดผลตอบแทนมาก',
      content:
        'Diversification ( การกระจายความเสี่ยง ) ทํางานอย่างไร : ถ้าลงทุนในหุ้นเดียว 100%: → หุ้นนั้นล้มละลาย → เงินหายทั้งหมด ! ถ้ากระจายใน 20 หุ้นเท่าๆกัน : → หุ้นหนึ่งล้มละลาย → สูญเสียแค่ 5% ของพอร์ตกระจายในมิติต่างๆ : → กระจาย Sector: tech, energy, healthcare, consumer → กระจาย Asset Class: หุ้นกองทุนทองคําพันธบัตร → กระจายภูมิศาสตร์ : ไทย + ต่างประเทศ → กระจายเวลา : DCA ทุกเดือนไม่ซื้อทีเดียวกองทุน Index Fund = Diversification ในตัวเอง : → SET50 Index = ลงทุนใน 50 บริษัทใหญ่ด้วยเงินก้อนเดียว',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 4,
      questions: [
        {
          questionText: 'ทําไม Diversification จึงสําคัญสําหรับนักลงทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะทําให้ได้ผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะลดความเสี่ยงจากการที่สินทรัพย์ใดสินทรัพย์หนึ่งให้ผลแย่',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะกฎหมายบังคับ', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะทําให้ซื้อหุ้นราคาถูกลง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'กองทุน SET50 Index Fund ช่วย Diversification อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลงทุนใน 50 สกุลเงินต่างประเทศ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ลงทุนใน 50 บริษัทใหญ่ที่สุดในตลาดหุ้นไทยด้วยเงินก้อนเดียว',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลดความเสี่ยงลงทุนใน 50 ประเทศ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ให้ผลตอบแทนสูงสุด 50% / ปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title:
        'สิทธิผู้บริโภคทางการเงิน : รู้ก่อนถูกเอาเปรียบ 🌐 Financial Knowledge',
      description:
        'ผู้บริโภคทางการเงินมีสิทธิ์ที่กฎหมายคุ้มครองรู้จักสิทธิ์เหล่านี้ช่วยป้องกันการถูกเอาเปรียบ',
      content:
        'สิทธิผู้บริโภคทางการเงินที่กฎหมายไทยคุ้มครอง : 1. สิทธิรับข้อมูลที่ถูกต้องครบถ้วนและทันเวลา : → ธนาคาร / ประกันต้องเปิดเผยข้อมูลสําคัญก่อนขาย 2. สิทธิเลือกสินค้า / บริการอย่างอิสระ : → ห้ามบังคับซื้อประกันเพื่อแลกกับสินเชื่อ (Tied Selling) 3. สิทธิร้องเรียนและได้รับการแก้ไข : → ร้องเรียนได้ที่ : ธปท . ( โทร 1213), คปภ . ( โทร 1186), ก . ล . ต . ( โทร 1207) 4. สิทธิความเป็นส่วนตัว : → ข้อมูลส่วนตัวห้ามนําไปใช้โดยไม่ได้รับอนุญาตกรณีที่ควรร้องเรียน : → ถูกเก็บค่าธรรมเนียมโดยไม่แจ้ง → ถูกขายผลิตภัณฑ์ที่ไม่เหมาะสมกับความต้องการ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 4,
      questions: [
        {
          questionText:
            'ถ้าธนาคารบังคับซื้อประกันเพื่อแลกกับการอนุมัติสินเชื่อควรทําอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ยอมรับเพราะเป็นกฎของธนาคาร',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ร้องเรียนไปที่ธปท . เพราะเป็น Tied Selling ที่ผิดกฎหมาย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขอยกเว้นจากผู้จัดการสาขา',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เปลี่ยนไปใช้ธนาคารอื่น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ร้องเรียนปัญหาเกี่ยวกับกองทุนรวมหรือหลักทรัพย์ไปที่หน่วยงานใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'กระทรวงการคลัง', isCorrect: false, orderNo: 1 },
              {
                choiceText: 'สํานักงานก . ล . ต . ( โทร 1207)',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'กรมพัฒนาธุรกิจการค้า',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'สภาหอการค้า', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W6: ทําไมเงินฝากไม่พอ',
      description:
        'ทบทวน Week 6 เรื่องพื้นฐานการลงทุนทําไมต้องลงทุนและเครื่องมือเบื้องต้น',
      content:
        'สรุป Week 6 — Investing Basics: เงินเฟ้อ vs ดอกเบี้ย : ฝากธนาคารอย่างเดียวกําลังซื้อลดทุกปีทางออก : ลงทุนในสินทรัพย์ที่ผลตอบแทนชนะเงินเฟ้อ Rule of 72: เงินเป็น 2 เท่า = 72 ÷ ผลตอบแทน (%) DCA: ลงทุนเท่ากันทุกเดือนเฉลี่ยต้นทุนไม่ต้องเดาตลาดกองทุนรวม : เหมาะมือใหม่กระจายเสี่ยงอัตโนมัติหุ้น : ผลตอบแทนสูงต้องมีความรู้และเวลา Diversification: กระจายความเสี่ยงลดผลกระทบสินทรัพย์ตัวใดตัวหนึ่งพัง',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ข้อใดสรุปเหตุผลที่ต้องลงทุนแทนการฝากธนาคารเพียงอย่างเดียวได้ดีที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'การลงทุนไม่มีความเสี่ยง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เงินเฟ้อทําให้กําลังซื้อลดลงทุกปีลงทุนให้ผลตอบแทนสูงกว่าช่วยรักษาและเพิ่มมูลค่าจริง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ธนาคารมีโอกาสล้มละลาย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กองทุนรวมรับประกันผลตอบแทน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'นักลงทุนที่มีเงิน 500 บาท / เดือนและมีเวลา 30 ปีควรเริ่มลงทุนในสินทรัพย์ใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เก็บสะสมจนมีเงินก้อนใหญ่ก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เริ่ม DCA กองทุน Index Fund ทันทีเพราะเวลา 30 ปีทําให้ดอกเบี้ยทบต้นทํางาน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ซื้อทองคําแท่งทุกเดือน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ฝากธนาคารไปก่อนเพราะจํานวนน้อยเกิน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W6: DCA และการเริ่มลงทุน',
      description:
        'ทบทวน DCA และแผนเริ่มต้นลงทุนจริงสําหรับนักศึกษาที่มีรายได้จํากัด',
      content:
        'ทบทวน DCA + แผนเริ่มลงทุนสําหรับนักศึกษา : DCA ทํางานอย่างไร : → ลงทุนเท่ากันทุกเดือนไม่สนราคา → เดือนราคาตํ่าซื้อหน่วยมาก → ต้นทุนเฉลี่ยตํ่า → ตัดอารมณ์ออกจากการลงทุนแผนเริ่มต้นสําหรับนักศึกษาจริง : เดือน 1-6: สร้าง Emergency Fund 30,000 บาทก่อนเดือน 7+: เริ่ม DCA 1,000 บาท / เดือนกองทุน SET50 Index ปรับขึ้น : เมื่อรายได้เพิ่มเพิ่ม DCA ตามเครื่องมือที่ใช้ได้ทันที : → แอปธนาคาร (Kasikorn KAsset, SCB Easy) → Finnomena, Jitta Wealth → กองทุนเริ่มต้น : 1KS1 (K-CASH), KT-SETINDEX',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ลําดับที่ถูกต้องในการเริ่มต้นการเงินของนักศึกษาคือข้อใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลงทุนหุ้น → ชําระหนี้ → สร้าง Emergency Fund',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'สร้าง Emergency Fund → เริ่ม DCA กองทุน → ค่อยลงทุนสินทรัพย์ซับซ้อนขึ้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ซื้อบ้าน → สร้าง Emergency Fund → ลงทุนหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ชําระหนี้ทั้งหมด → แล้วค่อยเริ่มออม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'เหตุใด DCA กองทุน Index Fund จึงเหมาะกับนักศึกษามากกว่าหุ้นรายตัว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'Index Fund ให้ผลตอบแทนสูงกว่าหุ้นรายตัวเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'Index Fund ไม่ต้องวิเคราะห์หุ้นเองกระจายความเสี่ยงดีเหมาะกับคนไม่มีเวลา',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Index Fund ไม่มีค่าธรรมเนียม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'Index Fund รับประกันไม่ขาดทุน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Portfolio เบื้องต้นสําหรับนักศึกษา',
      description:
        'ออกแบบพอร์ตลงทุนอย่างง่ายสําหรับนักศึกษาที่เริ่มต้นใหม่สมดุลระหว่างความปลอดภัยและการเติบโต',
      content:
        'ตัวอย่างพอร์ตสําหรับนักศึกษา ( รายได้ 15,000 / เดือน ): 20% ของรายได้ = 3,000 บาท / เดือนสําหรับ Save & Invest: แบ่งเป็น : → 1,500 บาท : Emergency Fund ( จนครบ 3 เดือน ) → 1,000 บาท : DCA กองทุน SET50 Index ( ระยะยาว ) → 500 บาท : เงินสํารองเป้าหมายระยะกลาง ( ฝากประจํา ) เมื่อ Emergency Fund ครบแล้ว ( ประมาณ 20 เดือน ): → เพิ่ม DCA เป็น 2,000 บาท / เดือน → เพิ่มกองทุน RMF 500 บาท / เดือน ( เริ่มลดหย่อนภาษี ) → คงเงินสํารอง 500 บาท / เดือนหลักการ : ง่ายสมํ่าเสมอปรับได้ตามสถานการณ์',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 5,
      questions: [
        {
          questionText:
            'สําหรับนักศึกษาที่เพิ่งเริ่มต้นควรจัดลําดับความสําคัญ 20% ของรายได้อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลงทุนหุ้น 100% เพื่อผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'Emergency Fund ก่อนแล้วค่อยจัดสรรลงทุนระยะยาว',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'ซื้อทองคํา 100%', isCorrect: false, orderNo: 3 },
              { choiceText: 'ฝากธนาคารทั้งหมด', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทําไมควรเพิ่ม DCA เมื่อ Emergency Fund ครบแล้ว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะ Emergency Fund สร้างผลตอบแทนได้แล้ว',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเงินที่เคยสร้าง Emergency Fund สามารถนําไปลงทุนระยะยาวได้เต็มที่แล้ว',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'เพราะธนาคารบังคับ', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'เพราะ DCA ราคาตํ่าลงเมื่อลงทุนมากขึ้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'เงินเฟ้อในชีวิตจริง : สังเกตได้จากอะไร ? 🌐 Financial Knowledge',
      description:
        'เงินเฟ้อไม่ใช่แค่ตัวเลข CPI แต่สังเกตได้จากราคาสินค้ารอบตัวทําความเข้าใจช่วยวางแผนการเงินได้ดีขึ้น',
      content:
        'เงินเฟ้อ (Inflation) ในชีวิตจริง : CPI (Consumer Price Index): ตัวเลขวัดเงินเฟ้อโดยเฉลี่ยจากสินค้า / บริการ 422 รายการเงินเฟ้อในชีวิตจริงที่สังเกตได้ : → ข้าวผัดกะเพราร้านเดิมจาก 40 บาทเป็น 60 บาทใน 5 ปี → กาแฟแก้วเดิมจาก 60 บาทเป็น 80 บาท → ค่ารถ BTS สายสีเขียวค่อยๆขึ้นตามเวลาเงินเฟ้อในไทย : เฉลี่ย ~2- 3% / ปีในสภาวะปกติช่วง COVID (2022): เงินเฟ้อพุ่ง 7-8% ( สูงสุดในรอบ 14 ปี ) เงินเฟ้อส่งผลต่อนักลงทุนอย่างไร : → หุ้นและอสังหาฯมักชนะเงินเฟ้อในระยะยาว → เงินสดและพันธบัตรดอกเบี้ยตํ่าแพ้เงินเฟ้อ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 6,
      dayNum: 5,
      questions: [
        {
          questionText: 'CPI วัดอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ราคาหุ้นในตลาดหลักทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ระดับราคาสินค้าและบริการที่ผู้บริโภคซื้อใช้วัดอัตราเงินเฟ้อ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'อัตราดอกเบี้ยธนาคาร',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ค่าเงินบาทเทียบดอลลาร์',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'สินทรัพย์ใดมักช่วยรักษามูลค่าได้ดีในช่วงเงินเฟ้อสูง ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เงินสดและบัญชีออมทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'หุ้นและอสังหาริมทรัพย์เพราะมูลค่าปรับตามราคาสินค้า',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'พันธบัตรดอกเบี้ยคงที่',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'ประกันชีวิต', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'เลือกหุ้น : ดูอะไรก่อน ?',
      description:
        'การเลือกหุ้นไม่ใช่การเดาแต่ต้องวิเคราะห์จากข้อมูลจริงเรียนรู้ 5 สิ่งที่ต้องดูก่อนซื้อหุ้น',
      content:
        '5 สิ่งที่ต้องดูก่อนเลือกหุ้น : 1. ทําความเข้าใจธุรกิจ : เข้าใจว่าบริษัทหาเงินได้อย่างไรใครคือลูกค้าใครคือคู่แข่ง 2. ผลประกอบการ ( งบการเงิน ): → กําไรสุทธิ : เพิ่มขึ้นทุกปีไหม ? → ROE (Return on Equity): สูงกว่า 10% ถือว่าดี → หนี้สิน / ทุน : ไม่สูงเกินไป 3. Valuation ( มูลค่า ): P/E Ratio เปรียบกับอุตสาหกรรม 4. Dividend History: จ่ายปันผลสมํ่าเสมอไหม ? 5. แนวโน้มอุตสาหกรรม : อุตสาหกรรมนี้มีอนาคตไหม ? แหล่งข้อมูลฟรี : → www.set.or.th → Company Profile → Settrade.com → Factsheet → รายงานประจําปี (Annual Report) ของบริษัท',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 1,
      questions: [
        {
          questionText: 'ในการเลือกหุ้น ROE ควรอยู่ที่ระดับใดจึงถือว่าดี ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'สูงกว่า 2%', isCorrect: false, orderNo: 1 },
              { choiceText: 'สูงกว่า 10%', isCorrect: true, orderNo: 2 },
              { choiceText: 'สูงกว่า 50%', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ROE ยิ่งตํ่ายิ่งดี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'แหล่งข้อมูลใดที่นักลงทุนควรอ่านเพื่อเข้าใจธุรกิจของบริษัทหุ้นได้ดีที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กระแสข่าวในโซเชียลมีเดีย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'รายงานประจําปี (Annual Report) และ Factsheet จากเว็บไซต์ SET',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'คําแนะนําจากเพื่อนที่เล่นหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ราคาหุ้นย้อนหลัง 1 ปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'P/E Ratio: วัดราคาหุ้นว่า " แพง " หรือ " ถูก "',
      description:
        'P/E Ratio คือเครื่องมือวัดมูลค่าหุ้นที่ใช้บ่อยที่สุดแต่ต้องเปรียบเทียบในบริบทที่ถูกต้อง',
      content:
        'P/E Ratio (Price-to-Earnings Ratio): สูตร : P/E = ราคาหุ้น ÷ กําไรต่อหุ้น (EPS) หมายความว่า : คุณจ่ายเงิน X บาทต่อกําไร 1 บาทของบริษัทตัวอย่าง : หุ้น AOT ราคา 60 บาท EPS 3 บาท → P/E = 20 เท่า → คุณจ่าย 20 บาทต่อกําไร 1 บาทเปรียบเทียบ P/E: → P/E สูง (20-30+): ตลาดคาดหวังการเติบโตสูง → P/E ตํ่า (<10): ราคาถูกหรือตลาดไม่เชื่อมั่น → ต้องเปรียบกับ P/E เฉลี่ยอุตสาหกรรมเสมอข้อจํากัด : P/E ตํ่าไม่ได้แปลว่าดีเสมอต้องดูเหตุผลด้วย SET P/E เฉลี่ย : ~15-18 เท่า ( ในสภาวะปกติ )',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 1,
      questions: [
        {
          questionText: 'P/E Ratio คํานวณอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ราคาหุ้น ÷ มูลค่าสินทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ราคาหุ้น ÷ กําไรต่อหุ้น (EPS)',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'กําไรต่อหุ้น ÷ ราคาหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'มูลค่าบริษัท ÷ รายได้รวม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'หุ้น P/E 30 เทียบกับค่าเฉลี่ย SET 15 เท่าหมายความว่าอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นนี้มีกําไรสูงกว่าค่าเฉลี่ยสองเท่า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'นักลงทุนคาดหวังการเติบโตสูงมากราคาค่อนข้างแพงต้องระวัง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'หุ้นนี้น่าซื้อเพราะถูกกว่าค่าเฉลี่ย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'บริษัทมีหนี้สูงกว่าค่าเฉลี่ย',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Fundamental vs Technical Analysis',
      description:
        'นักลงทุนใช้ 2 วิธีวิเคราะห์หุ้นเข้าใจความต่างช่วยเลือกวิธีที่เหมาะกับสไตล์การลงทุนของตัวเอง',
      content:
        'Fundamental Analysis: → วิเคราะห์จากพื้นฐานธุรกิจ : งบการเงินกําไรหนี้สิน P/E ROE → เหมาะกับ : นักลงทุนระยะยาว (1-10+ ปี ) → ตัวอย่าง : Warren Buffett ลงทุนหุ้น Coca-Cola เพราะธุรกิจดีมาก Technical Analysis: → วิเคราะห์จากกราฟราคาและปริมาณซื้อขาย → เหมาะกับ : นักเก็งกําไรระยะสั้น - กลาง → เชื่อว่าราคาในอดีตบอกทิศทางอนาคตได้ข้อดี / ข้อเสีย : → Fundamental: ต้องใช้เวลาวิเคราะห์แต่ลดความเสี่ยงระยะยาว → Technical: เร็วกว่าแต่ต้องติดตามกราฟตลอดสําหรับนักศึกษา : เริ่มจาก Fundamental ก่อนเพราะเหมาะกับการลงทุนระยะยาว',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 1,
      questions: [
        {
          questionText:
            'Fundamental Analysis เหมาะกับนักลงทุนประเภทใดมากที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'นักเก็งกําไรรายวัน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'นักลงทุนระยะยาวที่ต้องการผลตอบแทนสมํ่าเสมอ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'นักลงทุนที่ต้องการกําไรเร็ว',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ผู้ที่เชี่ยวชาญการอ่านกราฟ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'Warren Buffett เป็นตัวอย่างของนักลงทุนแนวใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'Technical Analysis ( กราฟ )',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'Fundamental Analysis ( พื้นฐานธุรกิจ )',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Quantitative Analysis ( สถิติ )',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'Sentiment Analysis ( อารมณ์ตลาด )',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ภาษีเงินปันผล : เสียเท่าไหร่ ? 🌐 Financial Knowledge',
      description:
        'เงินปันผลที่ได้รับจากหุ้นต้องเสียภาษีรู้เงื่อนไขช่วยวางแผนการลงทุนได้ดีขึ้น',
      content:
        'ภาษีเงินปันผลในไทย : อัตราภาษีหักณที่จ่าย : 10% ของเงินปันผล ( หักอัตโนมัติโดยบริษัท ) ตัวอย่าง : ได้ปันผล 10,000 บาท → ได้รับจริง 9,000 บาท ( หัก 10% = 1,000 บาท ) ตัวเลือกสําหรับผู้มีรายได้น้อย : → นําปันผลไปรวมคํานวณภาษีประจําปี → ถ้าฐานภาษีตํ่ากว่า 10% อาจขอคืนภาษีบางส่วนได้ข้อยกเว้น : หุ้นในกองทุน RMF/LTF → ไม่ต้องเสียภาษีปันผลกองทุนรวมหุ้น : กองทุนจ่ายปันผลออกมา → ผู้ถือหน่วยหักภาษี 10% บทเรียน : การลงทุนผ่าน RMF/SSF ช่วยประหยัดภาษีได้ 2 ทาง : ลดหย่อนภาษีตอนซื้อ + ไม่เสียภาษีปันผล',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 1,
      questions: [
        {
          questionText:
            'เงินปันผลจากหุ้นในไทยถูกหักภาษีณที่จ่ายในอัตราเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '5%', isCorrect: false, orderNo: 1 },
              { choiceText: '10%', isCorrect: true, orderNo: 2 },
              { choiceText: '15%', isCorrect: false, orderNo: 3 },
              { choiceText: '20%', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทางเลือกใดช่วยประหยัดภาษีเงินปันผลได้ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลงทุนในหุ้นหลายตัวพร้อมกัน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ลงทุนผ่านกองทุน RMF เพราะปันผลไม่ต้องเสียภาษีเพิ่ม',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขายหุ้นก่อนวันที่ขึ้นเครื่องหมาย XD',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ถือหุ้นนานกว่า 5 ปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Market Volatility: ตลาดผันผวนไม่ต้องกลัว',
      description:
        'ความผันผวนของตลาดหุ้นคือเรื่องปกติไม่ใช่สัญญาณหายนะนักลงทุนระยะยาวที่รับมือถูกวิธีได้เปรียบมาก',
      content:
        'Market Volatility คือการที่ราคาหุ้นเปลี่ยนแปลงขึ้นลงอย่างรวดเร็วสาเหตุทั่วไป : ข่าวเศรษฐกิจเหตุการณ์โลกผลประกอบการดอกเบี้ยข้อเท็จจริงที่ต้องรู้ : → ตลาดหุ้นผันผวนทุกปีถือเป็นเรื่องปกติ → ตั้งแต่ปี 1900-2020 ตลาดหุ้นสหรัฐให้ผลตอบแทน ~10% / ปีเฉลี่ยแม้ผ่านวิกฤตหลายครั้ง → ช่วงตลาดลงคือ "sale" สําหรับนักลงทุน DCA VIX Index: วัดความกลัวในตลาด ( ยิ่งสูงยิ่งผันผวนยิ่งน่ากลัว ) กลยุทธ์รับมือ : → DCA ต่อไม่หยุด → ไม่ดูพอร์ตทุกวัน → จําไว้ว่าลงทุนระยะยาวไม่ใช่เก็งกําไรระยะสั้น',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 2,
      questions: [
        {
          questionText:
            'ตลาดหุ้นปรับตัวลงแรง 20% นักลงทุน DCA ระยะยาวควรทําอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ขายหุ้นทั้งหมดออกก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'DCA ต่อตามแผนเพราะซื้อได้หน่วยมากขึ้นในราคาถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'หยุด DCA รอให้ตลาดฟื้นก่อน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'โยกเงินไปฝากธนาคารทั้งหมด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมความผันผวนของตลาดจึงเป็น " โอกาส " สําหรับนักลงทุน DCA?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะทําให้ขายได้กําไรมากขึ้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะช่วงตลาดลง DCA ซื้อได้หน่วยมากขึ้นในราคาถูกลดต้นทุนเฉลี่ย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะธนาคารให้ดอกเบี้ยสูงขึ้นในช่วงนั้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะภาษีลดลงในช่วงตลาดผันผวน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'FOMO และ Panic Sell: ศัตรูของนักลงทุน',
      description:
        'อารมณ์คือศัตรูที่ร้ายแรงที่สุดในการลงทุน FOMO และ Panic Sell ทําให้คนส่วนใหญ่ได้ผลตอบแทนตํ่ากว่าตลาด',
      content:
        'FOMO (Fear of Missing Out): กลัวพลาดโอกาสทํากําไร → เห็นหุ้นขึ้นแรง → รีบซื้อตามโดยไม่วิเคราะห์ → ผลลัพธ์ : มักซื้อแพงขายถูก Panic Sell: กลัวขาดทุนเพิ่มขายหุ้นออกตอนตลาดลง → เห็นพอร์ตลด 20% → กลัว → ขายทิ้ง → ผลลัพธ์ : Lock การขาดทุนไม่ได้รับประโยชน์จากตลาดฟื้นตัวสถิติสําคัญ : นักลงทุนส่วนบุคคลโดยเฉลี่ยได้ผลตอบแทนตํ่ากว่าตลาด 2- 4% / ปีเพราะ Timing ผิดวิธีป้องกัน : → มีแผนที่ชัดเจนก่อนลงทุน → ลงทุนแบบ DCA อัตโนมัติ → ไม่ดูพอร์ตทุกวัน → เตือนตัวเองว่าลงทุนระยะยาว',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 2,
      questions: [
        {
          questionText: 'FOMO ในการลงทุนคืออะไรและนําไปสู่ปัญหาอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กลัวสูญเสียเงินทั้งหมดทําให้ไม่กล้าลงทุน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'กลัวพลาดโอกาสทําให้ซื้อหุ้นตามกระแสโดยไม่วิเคราะห์มักซื้อแพงและขายถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'กลัวเสียภาษีมากทําให้ไม่ขายหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กลัวตลาดหุ้นปิดทําให้รีบขายก่อน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'วิธีที่ดีที่สุดในการป้องกัน Panic Sell คืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ติดตามข่าวตลาดทุกชั่วโมง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'มีแผนที่ชัดเจน DCA อัตโนมัติและไม่ดูพอร์ตทุกวัน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลงทุนแค่ในหุ้นที่ปลอดภัยเท่านั้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ขายหุ้นออกเมื่อตลาดลง 5%',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Long-term Investing: ทําไมระยะยาวชนะเสมอ',
      description:
        'ข้อมูลจากตลาดหุ้นทั่วโลกแสดงให้เห็นว่านักลงทุนระยะยาวมีโอกาสชนะสูงกว่าคนเก็งกําไรระยะสั้น',
      content:
        'หลักฐานว่า Long-term Investing ได้เปรียบ : ตลาดหุ้นสหรัฐ (S&P 500): → ถือ 1 ปี : มีโอกาสกําไร ~70% → ถือ 5 ปี : มีโอกาสกําไร ~88% → ถือ 10 ปี : มีโอกาสกําไร ~95% → ถือ 20 ปี : ไม่เคยขาดทุนเลยในประวัติศาสตร์ ! SET ไทย : มีแนวโน้มคล้ายกันยิ่งถือนานยิ่งเสี่ยงน้อย Warren Buffett: " เวลาในตลาดสําคัญกว่าการจับเวลาตลาด " Time in Market > Timing the Market ข้อเสียของการเก็งกําไรระยะสั้น : → ค่าธรรมเนียมซื้อ - ขายสูง (0.15- 0.25% / ครั้ง ) → ภาษีจากกําไร ( ถ้าถือน้อยกว่า 1 ปี ) → ต้องใช้เวลาและความรู้มาก',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 2,
      questions: [
        {
          questionText:
            'จากข้อมูลตลาดหุ้นสหรัฐถ้าถือ 10 ปีมีโอกาสได้กําไรประมาณเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '50%', isCorrect: false, orderNo: 1 },
              { choiceText: '70%', isCorrect: false, orderNo: 2 },
              { choiceText: '80%', isCorrect: false, orderNo: 3 },
              { choiceText: '95%', isCorrect: true, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            '"Time in Market > Timing the Market" หมายความว่าอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ควรซื้อหุ้นให้ถูกที่สุดเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'การลงทุนให้นานสําคัญกว่าการพยายามเลือกจังหวะซื้อ - ขายที่ดีที่สุด',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ต้องติดตามตลาดทุกชั่วโมง',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนได้เฉพาะช่วงเวลาที่ตลาดเปิด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'RMF และ SSF: ลงทุนพร้อมลดภาษี 🌐 Financial Knowledge',
      description:
        'RMF และ SSF เป็นกองทุนพิเศษที่ช่วยลดหย่อนภาษีได้นักลงทุนที่เสียภาษีควรรู้จัก',
      content:
        'RMF (Retirement Mutual Fund) — กองทุนเพื่อการเลี้ยงชีพ : ลดหย่อนได้ : สูงสุด 30% ของรายได้ไม่เกิน 500,000 บาท / ปีเงื่อนไข : ต้องถือจนอายุ 55 ปีและถือมาแล้วอย่างน้อย 5 ปีผิดเงื่อนไข : ต้องคืนภาษีทั้งหมดและเสียเบี้ยปรับ SSF (Super Saving Fund) — กองทุนรวมเพื่อส่งเสริมการออม : ลดหย่อนได้ : สูงสุด 30% ของรายได้ไม่เกิน 200,000 บาท / ปีเงื่อนไข : ถือครองขั้นตํ่า 10 ปี ( นับจากวันซื้อ ) ตัวอย่างประโยชน์ : รายได้ 500,000 บาท / ปีซื้อ RMF 100,000 บาท → ลดฐานภาษีเหลือ 400,000 บาท → ประหยัดภาษี ~15,000-20,000 บาท / ปี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 2,
      questions: [
        {
          questionText: 'RMF ต่างจาก SSF อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'RMF ลดหย่อนภาษีได้ SSF ลดหย่อนไม่ได้',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'RMF ถือจนอายุ 55 ปีขึ้นไป SSF ถือขั้นตํ่า 10 ปีนับจากวันซื้อ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'RMF ลงทุนในทองคํา SSF ลงทุนในหุ้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่มีความต่างเหมือนกันทุกประการ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ใครได้รับประโยชน์สูงสุดจากการลงทุนใน RMF?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'นักเรียนและนักศึกษา',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ผู้มีรายได้สูงและเสียภาษีในอัตราสูงเพราะลดฐานภาษีได้มาก',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'ผู้ที่ไม่มีรายได้', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ข้าราชการที่มีกบข . แล้ว',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'เงินปันผล : รายได้ Passive จากหุ้น',
      description:
        'เงินปันผลคือส่วนแบ่งกําไรที่บริษัทจ่ายให้ผู้ถือหุ้นเป็น Passive Income ที่ดีถ้าเลือกหุ้นให้ถูก',
      content:
        'เงินปันผล (Dividend) คืออะไร : บริษัทนํากําไรส่วนหนึ่งมาแบ่งให้ผู้ถือหุ้นปีละ 1-2 ครั้งวันสําคัญที่ต้องรู้ : → วันประกาศปันผล : บริษัทแจ้งว่าจะจ่ายปันผลเท่าไหร่ → วัน XD (Ex-Dividend Date): ถ้าซื้อหลังวันนี้ไม่ได้ปันผลในรอบนั้น → วันจ่ายปันผล : เงินเข้าบัญชีจริง Dividend Yield: ผลตอบแทนจากปันผล → สูตร : ( ปันผลต่อหุ้นต่อปี ÷ ราคาหุ้น ) × 100 → ตัวอย่าง : ปันผล 3 บาท / หุ้นราคาหุ้น 60 บาท = Yield 5% หุ้นปันผลสูงในตลาดไทย : PTT, ADVANC, KBANK, BBL แนวคิด : ถือหุ้นปันผลสูงในระยะยาว = สร้าง Passive Income',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 3,
      questions: [
        {
          questionText: 'Dividend Yield 5% หมายความว่าอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ราคาหุ้นเพิ่มขึ้น 5% ต่อปี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ได้รับเงินปันผลคิดเป็น 5% ของราคาหุ้นที่ถืออยู่ต่อปี',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'บริษัทมีกําไร 5% ของรายได้',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'หุ้นลดราคา 5% ทุกปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ถ้าต้องการรับปันผลจากหุ้น KBANK ในรอบนี้ต้องซื้อหุ้นก่อนวันใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'วันประกาศปันผล', isCorrect: false, orderNo: 1 },
              { choiceText: 'วันจ่ายปันผล', isCorrect: false, orderNo: 2 },
              {
                choiceText: 'ก่อนวัน XD (Ex-Dividend Date)',
                isCorrect: true,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่มีข้อจํากัดเรื่องวันซื้อ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Dividend vs Growth Stock: เลือกแบบไหน ?',
      description:
        'หุ้นปันผล vs หุ้นเติบโตสองประเภทที่เหมาะกับนักลงทุนต่างแบบรู้จักความต่างช่วยเลือกได้ถูก',
      content:
        'เปรียบเทียบ Dividend Stock vs Growth Stock: Dividend Stock ( หุ้นปันผลสมํ่าเสมอ ): → บริษัทที่โตช้าแต่กําไรสมํ่าเสมอจ่ายปันผลทุกปี → ตัวอย่าง : PTT, KBANK, ADVANC, BBL → เหมาะกับ : ผู้ที่ต้องการกระแสเงินสดสมํ่าเสมอ Growth Stock ( หุ้นเติบโตสูง ): → บริษัทที่โตเร็วนํากําไรกลับไปลงทุนต่อจ่ายปันผลน้อยหรือไม่จ่าย → ตัวอย่าง : DELTA, GULF, บริษัท Tech → เหมาะกับ : ผู้ที่ต้องการกําไรส่วนต่างราคาระยะยาวสําหรับนักศึกษา : Growth Stock เหมาะกว่าในช่วงอายุน้อยเพราะมีเวลารอสําหรับวัยเกษียณ : Dividend Stock เหมาะกว่าเพราะต้องการกระแสเงินสด',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 3,
      questions: [
        {
          questionText: 'Growth Stock เหมาะกับนักลงทุนลักษณะใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ผู้สูงอายุที่ต้องการรายได้ประจํา',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'นักลงทุนอายุน้อยที่มีเวลายาวนานรอการเติบโต',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'คนที่ต้องการเงินสดทุกปี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ผู้ที่ต้องการลดความเสี่ยง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ทําไม PTT และ KBANK จึงเป็นตัวอย่าง Dividend Stock?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะราคาหุ้นสูงสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะเป็นบริษัทขนาดใหญ่กําไรสมํ่าเสมอมีประวัติจ่ายปันผลต่อเนื่อง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะเป็นหุ้นที่นักวิเคราะห์แนะนํามากที่สุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะ P/E ตํ่าที่สุดในตลาด',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ข้อผิดพลาดที่นักลงทุนมือใหม่มักทํา',
      description:
        'เรียนรู้จากความผิดพลาดของคนอื่นก่อนจะช่วยประหยัดเงินได้มากและเริ่มต้นได้ถูกทาง',
      content:
        '5 ข้อผิดพลาดที่พบบ่อยในนักลงทุนมือใหม่ : 1. ลงทุนโดยไม่มี Emergency Fund: → ตลาดลงต้องขายหุ้นตอนราคาตํ่าเพื่อนําเงินมาใช้ 2. ลงทุนด้วยเงินที่ต้องใช้ในระยะสั้น : → เงินค่าเทอมค่าหอ → ไม่ควรนําไปลงทุนหุ้น 3. ไม่กระจายความเสี่ยง : → ซื้อหุ้นเดียวหรือ Sector เดียวทั้งหมด 4. ซื้อตามคําแนะนําโดยไม่วิเคราะห์เอง : → ซื้อตาม "Guru" หรือ Line Group โดยไม่เข้าใจ 5. FOMO และ Panic Sell: → ซื้อตอนหุ้นขึ้นแรงขายตอนหุ้นลงแรงบทสรุป : นักลงทุนที่ดีคือผู้ที่มีวินัยไม่ใช่ผู้ที่ฉลาดที่สุด',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 3,
      questions: [
        {
          questionText: 'ข้อผิดพลาดใดที่อันตรายที่สุดสําหรับนักลงทุนมือใหม่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ลงทุนด้วยเงินน้อยเกินไป',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ลงทุนด้วยเงินที่จําเป็นต้องใช้ในระยะสั้นหรือไม่มี Emergency Fund',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่อ่านรายงานประจําปี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนในกองทุนแทนหุ้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ทําไมการซื้อหุ้นตาม Line Group หรือ Guru จึงอันตราย ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'เพราะผิดกฎหมาย', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'เพราะซื้อโดยไม่เข้าใจธุรกิจเมื่อราคาลงไม่รู้ว่าควรถือหรือขาย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะค่าคอมมิชชั่นสูงกว่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะ Guru มักแนะนําหุ้นต่างประเทศ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กองทุน PVD: ออมเพื่อเกษียณผ่านนายจ้าง 🌐 Financial Knowledge',
      description:
        'PVD ( กองทุนสํารองเลี้ยงชีพ ) เป็นสิทธิ์ที่พนักงานเอกชนหลายคนมีแต่ไม่ได้ใช้ประโยชน์เต็มที่',
      content:
        'PVD (Provident Fund — กองทุนสํารองเลี้ยงชีพ ): คืออะไร : กองทุนออมเพื่อเกษียณที่บริษัทและลูกจ้างส่งเงินร่วมกันนายจ้างสมทบ : 2-15% ของเงินเดือน ( ตามนโยบายบริษัท ) ลูกจ้างสมทบ : 2-15% ของเงินเดือน ( เลือกได้ในกรอบที่บริษัทกําหนด ) ข้อดี : → นายจ้างสมทบ = รับเงินฟรีทันที ! → ลดหย่อนภาษีได้ ( สูงสุด 15% ของรายได้ไม่เกิน 500,000 บาท ) → ผลตอบแทนดีกว่าเงินฝากบริหารโดยผู้เชี่ยวชาญความแตกต่าง PVD vs กบข .: → PVD: พนักงานเอกชน → กบข .: ข้าราชการคําแนะนํา : สมัครทันทีเมื่อเริ่มทํางานและส่งสูงสุดเท่าที่ทําได้ !',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 3,
      questions: [
        {
          questionText: 'ทําไม PVD จึงถือว่าเป็น " เงินฟรี " สําหรับพนักงาน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รัฐบาลสนับสนุนทั้งหมด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'นายจ้างสมทบเงินเพิ่มให้โดยที่พนักงานไม่ต้องทําอะไรเพิ่ม',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ดอกเบี้ยสูงกว่าธนาคาร',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่ต้องเสียภาษีตลอดกาล',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'พนักงานเอกชนที่ทํางานใหม่ควรทําอะไรกับ PVD ก่อน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รอดูก่อนว่าบริษัทมั่นคงไหม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'สมัครทันทีและส่งเงินสมทบสูงสุดเท่าที่บริษัทสมทบให้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่สมัครเพราะต้องการสภาพคล่อง',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รอจนได้เงินเดือนสูงกว่าปัจจุบัน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ภาวะตลาดหมี vs ตลาดวัว',
      description:
        'Bull Market และ Bear Market เป็นคําที่นักลงทุนต้องรู้เพราะช่วยตัดสินใจว่าควรทําอะไรในแต่ละสภาวะ',
      content:
        'Bull Market ( ตลาดวัว ): → ตลาดหุ้นขึ้น 20%+ จากจุดตํ่าสุด → นักลงทุนมองบวกเศรษฐกิจดี → หุ้นเติบโตทั่วไป Bear Market ( ตลาดหมี ): → ตลาดหุ้นลง 20%+ จากจุดสูงสุด → นักลงทุนกังวลเศรษฐกิจซบเซา → Recession มักตามมาประวัติศาสตร์ Bear Market: → เฉลี่ย 9-14 เดือนและลดลง ~30-40% → แต่ตามมาด้วย Bull Market ที่ยาวกว่าเสมอกลยุทธ์ในแต่ละภาวะ : → Bull Market: DCA ต่อระวัง FOMO → Bear Market: DCA ต่อห้าม Panic Sell สรุป : ทั้งสองภาวะ "DCA ต่อตามแผน " คือคําตอบที่ดีที่สุด',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 4,
      questions: [
        {
          questionText: 'Bear Market คือสภาวะใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ตลาดหุ้นขึ้น 20%+ จากจุดตํ่าสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ตลาดหุ้นลง 20%+ จากจุดสูงสุดมักมาพร้อมความกังวลทางเศรษฐกิจ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ตลาดหุ้นทรงตัวนาน 6+ เดือน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'นักลงทุนต่างชาติซื้อมากกว่าขาย',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'นักลงทุน DCA ระยะยาวควรทําอย่างไรในช่วง Bear Market?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ขายสินทรัพย์ทั้งหมดรอ Bull Market ก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'DCA ต่อตามแผนเพราะซื้อได้หน่วยมากขึ้นในราคาถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'หยุด DCA และรอจนตลาดฟื้นตัว 6 เดือน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เปลี่ยนไปลงทุนในทองคํา 100%',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'สร้างพอร์ตลงทุน Stage 2: ตัวอย่างจริง',
      description:
        'ดูตัวอย่างพอร์ตลงทุนที่เหมาะกับนักศึกษาหรือคนเพิ่งเริ่มทํางานเพื่อใช้เป็นแนวทางเริ่มต้น',
      content:
        'ตัวอย่างพอร์ตสําหรับนักลงทุนอายุ 20-25 ปี : ลงทุน 3,000 บาท / เดือนแบ่งเป็น : 50% → กองทุน SET50 Index Fund (1,500 บาท ) → กระจายความเสี่ยงอัตโนมัติ 50 บริษัทใหญ่ 30% → กองทุน SSF หุ้นไทย (900 บาท ) → ลดหย่อนภาษีได้ระยะยาว 10 ปี 20% → กองทุนตลาดเงิน / ออมทรัพย์ (600 บาท ) → สํารองสภาพคล่องทําไม 80% ในหุ้น ? → อายุน้อยระยะเวลายาวรับความผันผวนได้ → ตามหลัก "100 ลบอายุ = % ในหุ้น " (100-22 = 78% หุ้น ) ปรับพอร์ตทุกปี : เพิ่ม % กองทุนตราสารหนี้เมื่ออายุมากขึ้น',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 4,
      questions: [
        {
          questionText: 'กฎง่ายๆ "100 ลบอายุ " ใช้ทําอะไรในการลงทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'คํานวณจํานวนหุ้นที่ควรมี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ประมาณ % ที่ควรลงทุนในหุ้นเช่นอายุ 25 ปีควรมีหุ้น 75%',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'คํานวณเงินที่ต้องออมต่อเดือน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กําหนดจํานวนปีที่ควร DCA',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมนักลงทุนอายุน้อย 20-25 ปีจึงควรมีสัดส่วนหุ้นสูง (75-80%)?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะหุ้นให้ปันผลสูงที่สุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะมีเวลาลงทุนยาวพอรับความผันผวนและรอให้ตลาดฟื้นตัว',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะอายุน้อยได้ภาษีน้อยกว่า',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'เพราะธนาคารแนะนํา', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W7: หุ้นและการวิเคราะห์',
      description:
        'ทบทวนสาระสําคัญของ Week 7 เรื่องหุ้นการวิเคราะห์และจิตวิทยาการลงทุน',
      content:
        'สรุป Week 7 — Stock Market Deep Dive: เลือกหุ้น : ธุรกิจดีการเงินมั่นคงกําไรสมํ่าเสมอธรรมาภิบาลดี P/E Ratio: ราคา ÷ กําไร / หุ้นเปรียบกับอุตสาหกรรม Fundamental vs Technical: นักลงทุนระยะยาว → Fundamental ความผันผวน : ปกติไม่น่ากลัว → DCA ต่อ FOMO & Panic Sell: ศัตรูตัวร้าย → มีแผนไม่ฟังอารมณ์ Dividend: รายได้ Passive จากหุ้นดู Yield + XD Date Bear & Bull Market: ทั้งคู่ → DCA ต่อตามแผนเสมอ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 4,
      questions: [
        {
          questionText: 'นักลงทุนมือใหม่ที่ต้องการเลือกหุ้นเองควรดูอะไรก่อน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ราคาหุ้นว่าตํ่าที่สุดในตลาดไหม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'พื้นฐานธุรกิจกําไรความมั่นคงทางการเงินและธรรมาภิบาล',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ว่าหุ้นนั้นอยู่ใน Line Group ไหม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ปริมาณซื้อขายว่าสูงไหม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'จาก Week 7 ข้อสรุปที่สําคัญที่สุดสําหรับนักลงทุนระยะยาวคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ขายหุ้นเมื่อตลาดลง 10% เพื่อตัดขาดทุน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'มีวินัย DCA ต่อเนื่องไม่ให้อารมณ์ครอบงําการตัดสินใจ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เลือกเฉพาะหุ้นที่ P/E ตํ่าที่สุด',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนเฉพาะช่วง Bull Market',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ประกันสุขภาพ : เลือกแบบไหนดี ? 🌐 Financial Knowledge',
      description:
        'ประกันสุขภาพมีหลายแบบแต่ละแบบเหมาะกับสถานการณ์ต่างกันเข้าใจก่อนซื้อช่วยให้คุ้มค่า',
      content:
        'ประกันสุขภาพประเภทหลัก : 1. ประกันสุขภาพแบบเหมาจ่าย (Indemnity): → เบิกค่ารักษาจริงแต่ไม่เกินวงเงิน → เบี้ยตํ่ากว่าเหมาะสําหรับเริ่มต้น 2. ประกันสุขภาพแบบเงินได้รายวัน : → รับเงินสดทุกวันที่นอนรักษาในโรงพยาบาล → เหมาะเป็นรายได้เสริมระหว่างนอนป่วย 3. ประกันสุขภาพแบบ OPD/IPD: → OPD ( ผู้ป่วยนอก ): คลินิก / ห้องฉุกเฉิน → IPD ( ผู้ป่วยใน ): นอนโรงพยาบาลสิ่งที่ต้องพิจารณาก่อนซื้อ : → วงเงินคุ้มครอง : ตํ่ากว่า 1 ล้านบาท / ปีอาจไม่พอ → โรงพยาบาลในเครือข่าย → Pre-existing condition ( โรคเดิมอาจไม่คุ้มครอง )',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 4,
      questions: [
        {
          questionText: 'ประกันสุขภาพแบบ " เงินได้รายวัน " ทํางานอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'จ่ายค่ารักษาพยาบาลจริงตามใบเสร็จ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'จ่ายเงินสดให้ผู้เอาประกันทุกวันที่นอนรักษาในโรงพยาบาล',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลดหย่อนภาษีได้ทุกปี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'คุ้มครองทุกโรคโดยไม่มีเงื่อนไข',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            '"Pre-existing condition" หมายถึงอะไรในบริบทประกันสุขภาพ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'โรคที่เกิดหลังทําประกัน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'โรคหรืออาการที่มีก่อนทําประกันซึ่งมักไม่ถูกคุ้มครองในช่วงแรก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'โรคที่คุ้มครองพิเศษ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'โรคที่ต้องการเบี้ยประกันสูงกว่า',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W7: เงินปันผล',
      description:
        'ทบทวนเรื่องเงินปันผลและวันสําคัญที่เกี่ยวข้องซึ่งเป็นพื้นฐานสําหรับนักลงทุนหุ้นระยะยาว',
      content:
        'ทบทวนเรื่องเงินปันผล : เงินปันผล = บริษัทแบ่งกําไรให้ผู้ถือหุ้น Dividend Yield = ( ปันผล / ปี ÷ ราคาหุ้น ) × 100 วันสําคัญ : → วันประกาศ → XD Date → วันจ่ายปันผล → ต้องถือก่อน XD Date จึงจะได้ปันผลภาษีปันผล : 10% หักอัตโนมัติหุ้น Growth vs Dividend: → Growth: ไม่จ่ายหรือจ่ายน้อยแต่ราคาขึ้นเร็ว → Dividend: จ่ายสมํ่าเสมอราคามั่นคงกลยุทธ์ : ถือหุ้นปันผลดี + DCA ระยะยาว = Passive Income ที่เพิ่มขึ้นเรื่อยๆ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ถือหุ้น AOT 2,000 หุ้นบริษัทจ่ายปันผล 0.80 บาท / หุ้นหักภาษี 10% ได้รับเงินสุทธิเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '1,600 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '1,440 บาท', isCorrect: true, orderNo: 2 },
              { choiceText: '1,760 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '2,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ถ้าซื้อหุ้น KBANK หลังวัน XD แล้วจะเกิดอะไรขึ้น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ได้รับปันผลเพิ่มขึ้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ไม่ได้รับปันผลในรอบนั้นต้องรอรอบถัดไป',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'ราคาหุ้นปรับขึ้น', isCorrect: false, orderNo: 3 },
              {
                choiceText: 'ได้รับปันผลครึ่งหนึ่ง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Review W7: Volatility และจิตวิทยา',
      description:
        'ทบทวนความผันผวนและจิตวิทยาการลงทุนสองหัวข้อที่กําหนดว่านักลงทุนส่วนใหญ่จะสําเร็จหรือล้มเหลว',
      content:
        'ทบทวนจิตวิทยาการลงทุนที่สําคัญ : Market Cycle: Bull → Bear → Recovery → Bull ( วนเวียน ) ความกลัวที่ต้องเอาชนะ : → FOMO: กลัวพลาด → ซื้อแพง → Panic: กลัวขาดทุน → ขายถูกหลักการ : " ซื้อตอนที่คนอื่นกลัวขายตอนที่คนอื่นโลภ " (Warren Buffett) เครื่องมือควบคุมอารมณ์ : → มีนโยบายการลงทุนที่เป็นลายลักษณ์อักษร → ตั้ง DCA อัตโนมัติไม่ต้องตัดสินใจทุกเดือน → ไม่ดูพอร์ตทุกวัน → จําไว้เสมอ : ลงทุนระยะยาวไม่ใช่เก็งกําไรสถิติ : นักลงทุนที่ไม่แตะพอร์ตทําผลตอบแทนได้ดีกว่าคนที่ trade บ่อย',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 5,
      questions: [
        {
          questionText:
            'Warren Buffett กล่าวว่า " ซื้อตอนที่คนอื่นกลัวขายตอนที่คนอื่นโลภ " ประยุกต์ใช้อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ซื้อเฉพาะตอนข่าวดีขายตอนข่าวร้าย',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ช่วง Bear Market ที่คนกลัวคือโอกาสซื้อหุ้นดีในราคาถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขายหุ้นเสมอเมื่อตลาดขึ้น 10%',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ซื้อหุ้นที่นักลงทุนรายอื่นไม่ซื้อ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมการตั้ง DCA อัตโนมัติจึงช่วยการลงทุนได้ดีกว่าการตัดสินใจเองทุกเดือน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะ DCA อัตโนมัติให้ผลตอบแทนสูงกว่า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะตัดอารมณ์ออกลงทุนสมํ่าเสมอโดยไม่ขึ้นกับ FOMO หรือ Panic',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะค่าธรรมเนียมตํ่ากว่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะบริษัทกองทุนบังคับ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Wealth Ratio: เป้าหมายสูงสุด',
      description:
        'Wealth Ratio คือตัวชี้วัดที่บอกว่าคุณถึงอิสรภาพทางการเงินหรือยัง — เมื่อ passive income มากกว่าค่าใช้จ่าย',
      content:
        'ตัวชี้วัดสุขภาพการเงิน 2 ตัว (WMD1001): Survival Ratio = รายได้รวม ÷ รายจ่าย → > 1 = อยู่รอดได้ยังต้องทํางาน Wealth Ratio = รายได้จากสินทรัพย์ ÷ รายจ่าย → = 1 = Break Even (Passive Income = ค่าใช้จ่าย ) → > 1 = อิสรภาพทางการเงิน ! ตัวอย่าง : ค่าใช้จ่าย 30,000 บาท / เดือนรายได้จากหุ้น ( ปันผล ) + กองทุน = 30,000 บาท / เดือน → Wealth Ratio = 1.0 → ไม่ต้องทํางานแล้วถ้าต้องการ ! เส้นทางสู่ Wealth Ratio > 1: → สะสมสินทรัพย์ที่สร้าง Passive Income ให้มากพอ → Dividend Yield 4% ต้องมีสินทรัพย์ = 30,000 × 12 ÷ 4% = 9,000,000 บาท',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 5,
      questions: [
        {
          questionText: 'Wealth Ratio > 1 หมายความว่าอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'มีหนี้สินมากกว่าสินทรัพย์',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'รายได้จาก Passive Income มากกว่าค่าใช้จ่ายอยู่ได้โดยไม่ต้องทํางาน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เงินออมมากกว่า 1 ล้านบาท',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนมาแล้วมากกว่า 1 ปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ถ้าค่าใช้จ่าย 25,000 บาท / เดือนและ Dividend Yield 5% ต้องมีสินทรัพย์ให้ปันผลเท่าไหร่ถึงจะมี Wealth Ratio = 1?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: '3,000,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '6,000,000 บาท', isCorrect: true, orderNo: 2 },
              { choiceText: '7,500,000 บาท', isCorrect: false, orderNo: 3 },
              { choiceText: '9,000,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Cryptocurrency: ลงทุนหรือเก็งกําไร ? 🌐 Financial Knowledge',
      description:
        'Crypto ไม่ใช่การลงทุนแบบดั้งเดิมมีลักษณะเฉพาะที่ต้องเข้าใจก่อนตัดสินใจเข้าร่วม',
      content:
        'Cryptocurrency คืออะไร ? สินทรัพย์ดิจิทัลที่ทํางานบน Blockchain ไม่มีรัฐบาลหรือธนาคารกลางควบคุมตัวอย่าง : Bitcoin (BTC), Ethereum (ETH), Solana (SOL) ลักษณะสําคัญ : → ผันผวนมาก : Bitcoin เคยขึ้น 1,000% ใน 1 ปีและลง 80% ใน 1 ปี → ไม่มีปันผลไม่มีกระแสเงินสดราคาขึ้นกับ Sentiment ล้วนๆ → ตลาดเปิด 24/7 ไม่มีวันหยุดความเสี่ยงที่ต้องรู้ : → Regulatory Risk: รัฐบาลหลายประเทศยังไม่ชัดเจน → Security Risk: Hack เกิดขึ้นบ่อยเงินหายได้ → Liquidity Risk: บาง Coin ขายไม่ออกมุมมองในการลงทุน : → ควรถือเป็นส่วนเล็กของพอร์ต ( ไม่เกิน 5-10%) ถ้าสนใจ → ไม่ใช้เงินที่ขาดไม่ได้',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 7,
      dayNum: 5,
      questions: [
        {
          questionText: 'Cryptocurrency ต่างจากการลงทุนในหุ้นอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'Crypto มีปันผลสูงกว่าหุ้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'Crypto ไม่มีปันผลหรือกระแสเงินสดราคาขึ้นกับ Sentiment ผันผวนมากกว่ามาก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Crypto มีรัฐบาลคํ้าประกัน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'Crypto ซื้อขายได้เฉพาะธนาคาร',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ถ้าสนใจลงทุน Crypto ควรจัดสัดส่วนในพอร์ตอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: '100% เพราะผลตอบแทนสูงสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ไม่เกิน 5-10% และใช้เฉพาะเงินที่ไม่กระทบชีวิตถ้าหาย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: '50% เพราะกระจายความเสี่ยง',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ตั้งแต่ 30% ขึ้นไปเพื่อให้ได้ผลตอบแทนคุ้มค่า',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กองทุนรวมประเภทต่างๆ : เลือกให้ถูก',
      description:
        'กองทุนรวมมีหลายประเภทแต่ละแบบเหมาะกับเป้าหมายต่างกันเข้าใจก่อนเลือกช่วยให้ลงทุนได้ถูกต้อง',
      content:
        'ประเภทกองทุนรวมหลัก (WMD1401): 1. กองทุนตลาดเงิน : ลงทุนในพันธบัตรระยะสั้น ~1- 2% / ปีความเสี่ยงตํ่าสุด 2. กองทุนตราสารหนี้ : ลงทุนในหุ้นกู้ / พันธบัตร ~3- 5% / ปี 3. กองทุนผสม : หุ้น + ตราสารหนี้ ~4- 7% / ปีปรับสัดส่วนตาม Profile 4. กองทุนหุ้น : ลงทุนในหุ้น ~6- 10% / ปีความเสี่ยงสูงระยะยาว 5. กองทุน Index Fund: ติดตามดัชนี SET50/SET100 ค่าธรรมเนียมตํ่ามาก 6. กองทุน RMF/SSF: ลดหย่อนภาษีได้มีเงื่อนไขถือครอง 7. กองทุน FIF: ลงทุนในต่างประเทศกระจายความเสี่ยงนอกไทยหลักเลือก : ระยะเวลาลงทุน → ความเสี่ยงที่รับได้ → ประเภทกองทุนที่เหมาะ',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 1,
      questions: [
        {
          questionText:
            'กองทุนประเภทใดที่เหมาะสําหรับเก็บเงินสํารองฉุกเฉินที่ต้องถอนได้เร็ว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'กองทุนหุ้น', isCorrect: false, orderNo: 1 },
              { choiceText: 'กองทุนตลาดเงิน', isCorrect: true, orderNo: 2 },
              { choiceText: 'กองทุน RMF', isCorrect: false, orderNo: 3 },
              { choiceText: 'กองทุน FIF', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'กองทุน Index Fund มีข้อดีกว่ากองทุนหุ้นทั่วไปอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ผลตอบแทนสูงกว่าเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ค่าธรรมเนียมบริหารตํ่ากว่ามากเพราะลงทุนตามดัชนีไม่ต้องใช้ผู้เชี่ยวชาญเยอะ',
                isCorrect: true,
                orderNo: 2,
              },
              { choiceText: 'ไม่มีความเสี่ยง', isCorrect: false, orderNo: 3 },
              { choiceText: 'รัฐบาลคํ้าประกัน', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'NAV: มูลค่าหน่วยลงทุน',
      description:
        'NAV คือราคาของกองทุนซึ่งคํานวณจากมูลค่าสินทรัพย์ทั้งหมดหารด้วยจํานวนหน่วยรู้วิธีคํานวณช่วยตัดสินใจได้ดีขึ้น',
      content:
        'NAV (Net Asset Value) = มูลค่าหน่วยลงทุนสูตร : NAV = ( มูลค่าสินทรัพย์รวม − หนี้สิน ) ÷ จํานวนหน่วยทั้งหมดตัวอย่าง : กองทุนมีสินทรัพย์ 100 ล้านบาทหนี้สิน 1 ล้านบาทจํานวนหน่วย 10 ล้านหน่วย → NAV = (100 - 1) ÷ 10 = 9.90 บาท / หน่วย NAV คํานวณทุกวันทําการ ( ปิดตลาด ) NAV ขึ้น = สินทรัพย์ในกองทุนมีมูลค่าเพิ่มขึ้น NAV ลง = สินทรัพย์มีมูลค่าลดลง ( ไม่ต้องตกใจถ้า DCA ต่อ ) DCA คํานวณจาก NAV: ลงทุน 2,000 บาท NAV 10 บาท = ได้ 200 หน่วย',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 1,
      questions: [
        {
          questionText: 'NAV 15 บาท / หน่วยและลงทุน 3,000 บาทจะได้กี่หน่วย ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '45 หน่วย', isCorrect: false, orderNo: 1 },
              { choiceText: '150 หน่วย', isCorrect: false, orderNo: 2 },
              { choiceText: '200 หน่วย', isCorrect: true, orderNo: 3 },
              { choiceText: '3,000 หน่วย', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'ถ้า NAV ของกองทุนลดลงจาก 10 บาทเป็น 8 บาทนักลงทุน DCA ควรทําอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ขายทิ้งทั้งหมดก่อนลงตํ่ากว่านี้',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'DCA ต่อตามแผนเพราะซื้อได้หน่วยมากขึ้นในราคาถูก',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'หยุด DCA รอให้กลับมา 10 บาทก่อน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพิ่มเงิน DCA เป็น 2 เท่า',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'เลือกกองทุนรวมที่ดี : ดูอะไรบ้าง ?',
      description:
        'กองทุนรวมในไทยมีหลายพันกองทุนการเลือกให้ถูกต้องช่วยให้ผลตอบแทนดีขึ้นและลดความเสี่ยง',
      content:
        '5 สิ่งที่ต้องดูก่อนเลือกกองทุน : 1. Policy ( นโยบายลงทุน ): กองทุนนี้ลงทุนในอะไร ? ตรงกับเป้าหมายไหม ? 2. TER (Total Expense Ratio): ค่าธรรมเนียมรวมต่อปี → Index Fund: ~0.1-0.5% | กองทุนหุ้น active: ~1-2% → ยิ่งตํ่ายิ่งดีสําหรับผลตอบแทนสุทธิ 3. ผลตอบแทนย้อนหลัง : ดูหลายปีย้อนหลังไม่ใช่แค่ปีเดียว → ไม่รับประกันอนาคตแต่บอก consistency 4. ขนาดกองทุน : ใหญ่กว่ามักมั่นคงกว่าสภาพคล่องดีกว่า 5. ผู้จัดการกองทุน : ประสบการณ์และประวัติการบริหารแหล่งข้อมูล : morningstar.com, sec.or.th, finnomena.com',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 1,
      questions: [
        {
          questionText:
            'TER (Total Expense Ratio) ส่งผลต่อผลตอบแทนนักลงทุนอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ไม่ส่งผลเพราะเป็นค่าธรรมเนียมจากบริษัทกองทุน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'หักออกจากผลตอบแทนทุกปียิ่งสูงยิ่งลดผลตอบแทนสุทธิของนักลงทุน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ชําระครั้งเดียวตอนซื้อ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รัฐบาลคืนให้ทุกปีเมื่อยื่นภาษี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมการดูผลตอบแทนย้อนหลังเพียง 1 ปีจึงไม่เพียงพอในการเลือกกองทุน ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะ 1 ปีไม่ถือว่าเป็นผลตอบแทนจริง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะผลตอบแทน 1 ปีขึ้นกับสภาวะตลาดควรดูหลายปีเพื่อเห็นความสมํ่าเสมอ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะกฎหมายบังคับให้ดู 5 ปีขึ้นไป',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะกองทุนดีต้องขาดทุนบ้างทุกปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'การยื่นภาษีเงินได้ประจําปี 🌐 Financial Knowledge',
      description:
        'ยื่นภาษีถูกต้องอาจได้เงินคืนรู้ขั้นตอนก่อนเริ่มทํางานช่วยได้มาก',
      content:
        'ยื่นภาษีเงินได้บุคคลธรรมดาประจําปี : กําหนด : ยื่นภายในมีนาคม ( ยื่น online ได้ถึงเมษายน ) ที่ efiling.rd.go.th เอกสารสําคัญ : หนังสือ 50 ทวิ ( รับรองเงินเดือนจากนายจ้าง ) + หลักฐานค่าลดหย่อนค่าลดหย่อนยอดนิยม : ส่วนตัว 60,000 | ประกันชีวิตสูงสุด 100,000 | RMF/SSF สูงสุด 500,000 วิธีคิด : รายได้รวม − ค่าใช้จ่าย − ค่าลดหย่อน = ฐานภาษี → คํานวณภาษีตามขั้นบันไดถ้าถูกหักภาษีเกินจากเงินเดือน → ยื่นแล้วได้คืน ! ถ้าหักไม่พอ → ต้องจ่ายเพิ่มพร้อมดอกเบี้ย 1.5% / เดือนถ้าช้า',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 1,
      questions: [
        {
          questionText: 'เอกสาร 50 ทวิคืออะไรและใช้ทําอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ใบสมัครบัตรประชาชน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'หนังสือรับรองการหักภาษีณที่จ่ายใช้ประกอบการยื่นภาษีประจําปี',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ใบเสร็จค่าประกันสังคม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เอกสารกู้เงินกยศ .',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ทําไมพนักงานบางคนจึงได้รับเงินภาษีคืนหลังยื่น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รัฐบาลให้รางวัลคนยื่นภาษีตรงเวลา',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ภาษีที่ถูกหักจากเงินเดือนตลอดปีสูงกว่าภาษีที่คํานวณจริงหลังหักค่าลดหย่อน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ยื่น online ได้ส่วนลด 5%',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ยื่นครั้งแรกได้คืนเสมอ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'DCA กับกองทุน : วิธีตั้งระบบจริง',
      description:
        'รู้แนวคิด DCA แล้วแต่ตั้งระบบในชีวิตจริงอย่างไรขั้นตอนละเอียดที่ทําได้ตั้งแต่วันนี้',
      content:
        'ตั้งระบบ DCA กองทุนในชีวิตจริง : ขั้น 1: เลือกกองทุนเช่น SET50 Index Fund (TER ตํ่ากระจายเสี่ยงดี ) ขั้น 2: เลือกจํานวนเงิน : เริ่มต้น 1,000 บาท / เดือน ( ปรับขึ้นได้เมื่อรายได้เพิ่ม ) ขั้น 3: เลือกวันตัดบัญชี : วันรับเงินเดือนหรือ 1-3 วันหลังได้รับขั้น 4: ตั้ง Auto-Debit ผ่านแอปธนาคาร → เงินถูกหักอัตโนมัติทุกเดือนขั้น 5: ห้ามดูพอร์ตทุกวันดูทุก 3-6 เดือนพอช่องทางที่นิยม : KAsset ( กสิกร ), SCB Easy ( ไทยพาณิชย์ ), Finnomena, Jitta Wealth ตัวอย่าง DCA 1,000 บาท / เดือน @ 8% ปีเวลา 30 ปี = ประมาณ 1,359,000 บาท',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 2,
      questions: [
        {
          questionText: 'วันที่เหมาะสมที่สุดในการตัดบัญชี DCA คือวันใด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'วันสุดท้ายของเดือน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'วันที่ตลาดหุ้นลงมากที่สุด',
                isCorrect: false,
                orderNo: 2,
              },
              {
                choiceText: 'วันที่ได้รับเงินเดือนหรือหลังจากนั้น 1-3 วัน',
                isCorrect: true,
                orderNo: 3,
              },
              {
                choiceText: 'วันที่ 1 ของทุกเดือนเท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ข้อจํากัดสําคัญของ DCA ที่ต้องระวังคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ได้ผลตอบแทนน้อยกว่าการลงทุนครั้งเดียวเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ต้องมีวินัยสมํ่าเสมอหยุดกลางทางเสียประโยชน์จากดอกเบี้ยทบต้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลงทุนได้แค่กองทุนรวมเท่านั้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ต้องใช้เงินมากถึง 10,000 บาทขึ้นไปจึงจะเริ่มได้',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Rebalancing: ปรับพอร์ตให้สมดุล',
      description:
        'พอร์ตที่ไม่ Rebalance จะเบี้ยวจากเป้าหมายเดิมเมื่อเวลาผ่านไปทําอย่างไรและบ่อยแค่ไหน',
      content:
        'Rebalancing คือการปรับสัดส่วนพอร์ตกลับสู่เป้าหมายเดิมตัวอย่าง : ตั้งใจไว้หุ้น 70% / ตราสารหนี้ 30% หลัง 1 ปีตลาดขึ้นหุ้นกลายเป็น 85% / ตราสารหนี้ 15% → ต้องขายหุ้นบางส่วนซื้อตราสารหนี้เพิ่มให้กลับมา 70/30 ทําไมต้อง Rebalance: → รักษาระดับความเสี่ยงที่ตั้งใจไว้ → บังคับให้ " ขายแพงซื้อถูก " โดยอัตโนมัติ Rebalance บ่อยแค่ไหน : ปีละ 1 ครั้งหรือเมื่อสัดส่วนเบี้ยวเกิน 5-10% วิธีง่ายสุด : ใช้ DCA ปรับนํ้าหนักแทนการขายและซื้อใหม่',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 2,
      questions: [
        {
          questionText: 'Rebalancing พอร์ตหมายถึงอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพิ่มเงินลงทุนในพอร์ตทุกเดือน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ปรับสัดส่วนสินทรัพย์กลับสู่เป้าหมายที่กําหนดไว้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ขายสินทรัพย์ทั้งหมดแล้วเริ่มใหม่',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เปลี่ยนกลยุทธ์การลงทุนทุกปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไม Rebalancing จึงช่วย " ขายแพงซื้อถูก " โดยอัตโนมัติ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะระบบเลือกจังหวะตลาดให้',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะบังคับขายสินทรัพย์ที่ขึ้นมาก ( แพง ) และซื้อที่ขึ้นน้อย ( ถูกกว่า )',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะค่าธรรมเนียมตํ่าในช่วง Rebalance',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะกองทุนทําให้อัตโนมัติ',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ติดตามพอร์ตลงทุน : ดูอะไรดูบ่อยแค่ไหน ?',
      description:
        'ดูพอร์ตบ่อยเกินไปทําให้ตัดสินใจพลาดบ่อยแต่ไม่ดูเลยก็พลาดสัญญาณสําคัญ — ความสมดุลอยู่ที่ไหน ?',
      content:
        'หลักการติดตามพอร์ตที่ดี : ความถี่แนะนํา : ทุก 3-6 เดือน ( ไม่ใช่ทุกวัน !) สิ่งที่ควรดูเมื่อติดตามพอร์ต : → มูลค่ารวมและผลตอบแทนสะสม ( เทียบกับเงินที่ลงทุนจริง ) → สัดส่วนสินทรัพย์ยังตรงกับเป้าหมายไหม ? → กองทุนที่เลือกยังดีอยู่ไหม ? (TER ยังตํ่า ? ผลตอบแทนเทียบ Benchmark) → ควรเพิ่ม DCA หรือ Rebalance ไหม ? สิ่งที่ไม่ควรทํา : → ดูพอร์ตทุกวัน → เครียด → ตัดสินใจจากอารมณ์ → เปลี่ยนแผนทุกครั้งที่ตลาดขึ้นลง → เปรียบเทียบผลตอบแทนกับคนอื่นระยะสั้นเครื่องมือ : แอปกองทุน , Morningstar, Finnomena Dashboard',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 2,
      questions: [
        {
          questionText: 'ควรติดตามพอร์ตลงทุนระยะยาวบ่อยแค่ไหนจึงเหมาะสม ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทุกวันเพื่อไม่พลาดโอกาส',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'ทุก 3-6 เดือนเพื่อตรวจสอบโดยไม่ให้อารมณ์ขัดแผน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ปีละครั้งเมื่อยื่นภาษี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เฉพาะตอนตลาดผันผวนแรง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'เมื่อติดตามพอร์ตสิ่งสําคัญที่สุดที่ควรดูคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ว่าพอร์ตได้กําไรมากกว่าเพื่อนไหม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'สัดส่วนสินทรัพย์ยังตรงเป้าหมายและผลตอบแทนสะสมเทียบกับเงินที่ลงทุน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ว่ากองทุนใดขึ้นมากที่สุดในสัปดาห์นี้',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'อัตราดอกเบี้ยเงินฝากเทียบกับพอร์ต',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'ภาษีดอกเบี้ยเงินฝาก : หักแล้วได้คืนไหม ? 🌐 Financial Knowledge',
      description:
        'ดอกเบี้ยเงินฝากที่ได้รับถูกหักภาษีอัตโนมัติ 15% แต่มีเงื่อนไขบางอย่างที่ช่วยขอคืนได้',
      content:
        'ภาษีดอกเบี้ยเงินฝาก : อัตรา : หักภาษีณที่จ่าย 15% อัตโนมัติตัวอย่าง : ดอกเบี้ย 1,000 บาท → ธนาคารส่งให้สรรพากร 150 บาท → รับสุทธิ 850 บาทข้อยกเว้น : บัญชีเงินฝากประเภทที่ได้รับยกเว้นเช่นบัญชีออมทรัพย์พิเศษบางประเภทขอคืนภาษีได้ไหม : ได้ถ้านําดอกเบี้ยไปรวมกับรายได้อื่นแล้วคํานวณภาษีตํ่ากว่า 15% → เหมาะกับผู้มีรายได้น้อยหรืออยู่ในฐานภาษี 5-10% วิธีขอคืน : นํารายการดอกเบี้ยใส่ในแบบภ . ง . ด . 90/91 ตอนยื่นภาษีประจําปี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 2,
      questions: [
        {
          questionText: 'ดอกเบี้ยเงินฝากถูกหักภาษีณที่จ่ายอัตราเท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '5%', isCorrect: false, orderNo: 1 },
              { choiceText: '10%', isCorrect: false, orderNo: 2 },
              { choiceText: '15%', isCorrect: true, orderNo: 3 },
              { choiceText: '20%', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ใครมีสิทธิ์ขอคืนภาษีดอกเบี้ยเงินฝาก ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทุกคนที่มีบัญชีธนาคาร',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ผู้มีรายได้น้อยที่ฐานภาษีตํ่ากว่า 15% สามารถนําไปรวมคํานวณและขอคืนส่วนต่าง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เฉพาะผู้ที่ฝากเงินมากกว่า 1 ล้านบาท',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ผู้ที่อายุเกิน 60 ปีเท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'RMF และ SSF: ลงทุนประหยัดภาษีจริงๆ',
      description:
        'RMF และ SSF ช่วยลดภาษีได้จริงแต่มีเงื่อนไขที่ต้องรู้ก่อนตัดสินใจลงทุน',
      content:
        'RMF (Retirement Mutual Fund): ลดหย่อนได้ : 30% ของรายได้รวมกับกองทุนเกษียณอื่นไม่เกิน 500,000 บาท / ปีเงื่อนไข : ถือจนอายุ ≥ 55 ปีและถือมา ≥ 5 ปี ( นับปีเว้นปีได้ ) SSF (Super Saving Fund): ลดหย่อนได้ : 30% ของรายได้ไม่เกิน 200,000 บาท / ปีเงื่อนไข : ถือ ≥ 10 ปีนับจากวันซื้อแต่ละครั้งตัวอย่างประหยัดภาษีจริง : รายได้สุทธิ 600,000 บาท → ฐานภาษี 20% → ซื้อ RMF 100,000 บาท → ลดฐานภาษีเหลือ 500,000 บาท → ประหยัดภาษี 20,000 บาททันที ! กองทุน RMF ที่นิยม : กองทุนหุ้น , กองทุน Index Fund, กองทุนผสม',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 3,
      questions: [
        {
          questionText: 'RMF ช่วยประหยัดภาษีอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'ยกเว้นภาษีทั้งหมด', isCorrect: false, orderNo: 1 },
              {
                choiceText: 'ลดฐานรายได้ที่ใช้คํานวณภาษีทําให้เสียภาษีน้อยลง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ได้รับเงินคืน 30% จากรัฐบาล',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ไม่มีผลต่อภาษีแค่ช่วยออม',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ถ้าซื้อ RMF แล้วผิดเงื่อนไข ( ขายก่อนครบ ) จะเกิดอะไรขึ้น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              { choiceText: 'ขาดทุนเงินต้น', isCorrect: false, orderNo: 1 },
              {
                choiceText:
                  'ต้องคืนภาษีที่เคยลดหย่อนทั้งหมดพร้อมดอกเบี้ยเบี้ยปรับ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ถูกระงับสิทธิ์ลดหย่อนภาษี 1 ปี',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'ไม่มีผลใดๆ', isCorrect: false, orderNo: 4 },
            ],
          },
        },
      ],
    },
    {
      title: 'Asset Allocation: จัดพอร์ตตามอายุ',
      description:
        'การจัดสัดส่วนสินทรัพย์ที่เหมาะสมกับอายุและเป้าหมายช่วยให้พอร์ตเติบโตสมํ่าเสมอโดยรับความเสี่ยงที่รับได้',
      content:
        'Asset Allocation คือการจัดสัดส่วนสินทรัพย์ในพอร์ตกฎ "110 ลบอายุ " ( ปัจจุบัน ): % ในหุ้น = 110 − อายุ → อายุ 22 ปี : หุ้น 88%, ตราสารหนี้ 12% → อายุ 35 ปี : หุ้น 75%, ตราสารหนี้ 25% → อายุ 55 ปี : หุ้น 55%, ตราสารหนี้ 45% ตัวอย่างพอร์ตนักศึกษา ( อายุ 22 ปี ) DCA 2,000 บาท / เดือน : → 1,500 บาท : กองทุนหุ้นไทย /SET50 Index → 300 บาท : กองทุน RMF หุ้น → 200 บาท : กองทุนตลาดเงิน ( สภาพคล่อง ) ปรับพอร์ตเมื่อ : อายุเพิ่ม , เป้าหมายเปลี่ยน , หรือทุก 1-2 ปี',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 3,
      questions: [
        {
          questionText:
            'ตามกฎ "110 ลบอายุ " คนอายุ 30 ปีควรมีหุ้นกี่ % ในพอร์ต ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '30%', isCorrect: false, orderNo: 1 },
              { choiceText: '70%', isCorrect: false, orderNo: 2 },
              { choiceText: '80%', isCorrect: true, orderNo: 3 },
              { choiceText: '110%', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทําไมสัดส่วนหุ้นในพอร์ตควรลดลงเมื่ออายุมากขึ้น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะหุ้นให้ปันผลน้อยลงตามอายุ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะมีเวลาลงทุนน้อยลงรับความผันผวนได้น้อยกว่าต้องการความมั่นคง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพราะกฎหมายบังคับผู้สูงอายุถือหุ้นน้อย',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะหุ้นมีความเสี่ยงสูงขึ้นตามอายุบริษัท',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Bear Market ประวัติศาสตร์ : ทนแล้วได้รางวัล',
      description:
        'ทุก Bear Market ในประวัติศาสตร์ตามด้วย Bull Market เสมอดูตัวเลขจริงแล้วจะกลัวน้อยลง',
      content:
        'Bear Market ประวัติศาสตร์ที่สําคัญ : วิกฤต 2008 (Hamburger Crisis): SET ลด ~60% แต่ฟื้นกลับมาภายใน 2-3 ปี COVID-19 ( มี . ค . 2020): SET ลด ~35% ใน 5 สัปดาห์แต่ฟื้นใน 12 เดือนทุก Bear Market ในประวัติศาสตร์ SET: ฟื้นตัวกลับมาและทําสูงสุดใหม่เสมอนักลงทุนที่ DCA ตลอด 2008-2018 (10 ปี ): ผลตอบแทนเฉลี่ย 8- 10% / ปีบทเรียน : คนที่ขายออกตอน 2008 พลาดการฟื้นตัวที่ให้ผลตอบแทนดีที่สุดกลยุทธ์ที่พิสูจน์แล้ว : DCA ต่อเนื่องตลอด Bear Market → ต้นทุนเฉลี่ยตํ่ามาก → เมื่อตลาดฟื้นกําไรงาม',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 3,
      questions: [
        {
          questionText:
            'จากประวัติศาสตร์ตลาดหุ้น Bear Market ทุกครั้งจบลงอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'ตลาดหุ้นปิดถาวร', isCorrect: false, orderNo: 1 },
              {
                choiceText: 'ตามด้วย Bull Market และทําสูงสุดใหม่เสมอในระยะยาว',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ราคาหุ้นไม่เคยกลับสู่ระดับเดิม',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รัฐบาลต้องเข้าแทรกแซงทุกครั้ง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'นักลงทุน DCA ที่ดีที่สุดในช่วง Bear Market ทําอะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หยุด DCA รอให้ตลาดฟื้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'DCA ต่อตามแผนสะสมหน่วยในราคาถูกรอรับผลตอบแทนเมื่อตลาดฟื้น',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพิ่ม DCA เป็น 3 เท่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'โยกเงินทั้งหมดไปทองคํา',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'กบข . vs PVD: เกษียณข้าราชการ vs เอกชน 🌐 Financial Knowledge',
      description:
        'คนไทยสองกลุ่มใหญ่มีกองทุนเกษียณต่างกันรู้ว่ากลุ่มตัวเองอยู่ในระบบใดช่วยวางแผนได้ถูกต้อง',
      content:
        'กบข . ( กองทุนบําเหน็จบํานาญข้าราชการ ): สําหรับข้าราชการผู้ส่ง : ข้าราชการ 3% + รัฐบาลสมทบ 3% + เงินชดเชย 2% รวม 8% / เดือนผลประโยชน์ : บํานาญรายเดือน + เงินก้อน ( บําเหน็จ ) บํานาญ : 2% × ปีทํางาน × เงินเดือนเฉลี่ย 60 เดือนสุดท้าย PVD ( กองทุนสํารองเลี้ยงชีพ ): สําหรับพนักงานเอกชนผู้ส่ง : พนักงาน 2-15% + นายจ้างสมทบเท่ากันเงื่อนไขรับเงิน : ลาออกไล่ออกเกษียณ ( ตามอายุงาน ) ข้อดีเหมือนกัน : ลดหย่อนภาษีได้ทั้งคู่ทําไมสําคัญ : เงินจากกบข . /PVD อาจไม่พอต้องออมและลงทุนเพิ่มเอง',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 3,
      questions: [
        {
          questionText: 'PVD ต่างจากกบข . อย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'PVD สําหรับข้าราชการกบข . สําหรับเอกชน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'PVD สําหรับพนักงานเอกชนกบข . สําหรับข้าราชการ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ทั้งคู่ใช้ได้กับทุกคน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'PVD รัฐบาลบริหารกบข . บริษัทเอกชนบริหาร',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ทําไมเงินจาก PVD หรือกบข . เพียงอย่างเดียวอาจไม่พอใช้หลังเกษียณ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพราะรัฐบาลเก็บภาษีกองทุนสูง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพราะอัตราส่ง % คงที่อาจสะสมได้ไม่เพียงพอกับค่าครองชีพที่เพิ่มขึ้นตามเงินเฟ้อ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText:
                  'เพราะกองทุนเหล่านี้ลงทุนเฉพาะในพันธบัตรผลตอบแทนตํ่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะเงินหมดอายุหลังจ่ายไป 10 ปี',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Review Stage 2: สรุปการลงทุน',
      description:
        'ทบทวนความรู้การลงทุนทั้งหมดจาก Stage 2 ก่อนก้าวสู่วัยทํางานใน Stage 3',
      content:
        'สรุปการลงทุน Stage 2: ทําไมต้องลงทุน : เงินเฟ้อ 2-3% > ดอกเบี้ยเงินฝาก 1.5% → ต้องหาผลตอบแทนสูงกว่า Rule of 72: 72 ÷ ผลตอบแทน (%) = ปีที่เงินเป็น 2 เท่า DCA: ลงทุนสมํ่าเสมอทุกเดือนตัดอารมณ์เฉลี่ยต้นทุนกองทุน Index Fund: เหมาะมือใหม่ค่าธรรมเนียมตํ่ากระจายเสี่ยง NAV: ราคาหน่วยกองทุนคํานวณทุกวัน Rebalancing: ปรับสัดส่วนปีละครั้ง RMF/SSF: ลดหย่อนภาษีได้มีเงื่อนไขถือครอง Asset Allocation: อายุน้อย → หุ้นสูง | อายุมาก → ตราสารหนี้สูง',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 4,
      questions: [
        {
          questionText:
            'ข้อใดสรุปเหตุผลหลักที่ต้องลงทุนแทนการฝากธนาคารอย่างเดียวได้ดีที่สุด ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นไม่มีความเสี่ยง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เงินเฟ้อกินกําลังซื้อการลงทุนให้ผลตอบแทนสูงกว่าช่วยรักษาและเพิ่มมูลค่าจริง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'กองทุนรับประกันผลตอบแทน',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'ธนาคารอาจล้มละลาย', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'จาก Stage 2 เครื่องมือใดเหมาะที่สุดสําหรับนักลงทุนมือใหม่ที่เพิ่งเริ่มต้น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'หุ้นรายตัวที่วิเคราะห์เอง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'DCA กองทุน Index Fund ทุกเดือน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'Cryptocurrency 50% ของพอร์ต',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กองทุน RMF เท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: '10 คําถามก่อนลงทุนจริง',
      description:
        'Checklist 10 ข้อที่ควรถามตัวเองก่อนลงทุนครั้งแรกเพื่อป้องกันความผิดพลาดที่พบบ่อย',
      content:
        '10 คําถามก่อนลงทุนจริง : 1. มี Emergency Fund 3-6 เดือนแล้วหรือยัง ? 2. หนี้บัตรเครดิตหมดแล้วหรือยัง ? 3. เงินที่จะลงทุนนี้ไม่ได้ต้องใช้ใน 3-5 ปีใช่ไหม ? 4. เข้าใจสินทรัพย์ที่จะลงทุนพอไหม ? 5. รับได้ไหมถ้าพอร์ตลด 30% ชั่วคราว ? 6. ค่าธรรมเนียมรวม (TER) เท่าไหร่ ? 7. มีแผน DCA อัตโนมัติหรือยัง ? 8. รู้ว่าจะ Rebalance เมื่อไหร่และอย่างไร ? 9. มีเป้าหมายชัดเจน ( จํานวนเงิน + ระยะเวลา )? 10. พร้อม DCA ต่อแม้ตลาดลง ? ถ้าตอบ " ใช่ " ครบ 10 ข้อ → พร้อมลงทุนแล้ว !',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 4,
      questions: [
        {
          questionText: 'คําถามแรกที่ต้องถามก่อนเริ่มลงทุนคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กองทุนไหนให้ผลตอบแทนสูงสุดปีนี้ ?',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText: 'มี Emergency Fund 3-6 เดือนแล้วหรือยัง ?',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ตลาดหุ้นอยู่ที่ระดับไหน ?',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพื่อนลงทุนในอะไร ?',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'ทําไมต้องถามตัวเองว่า " รับได้ไหมถ้าพอร์ตลด 30%"?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เพื่อรู้ว่าต้องซื้อประกันพอร์ตเพิ่ม',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพื่อเลือกสินทรัพย์ที่ตรงกับ Risk Tolerance จริงๆไม่ใช่แค่ในทฤษฎี',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพื่อรู้ว่าต้องขายหุ้นออกทันที',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะกฎหมายบังคับให้ประเมินความเสี่ยง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'จาก Stage 2 สู่ Stage 3: วัยทํางาน',
      description:
        'สิ่งที่ได้เรียนใน Stage 2 คือพื้นฐานใน Stage 3 จะต่อยอดไปสู่การสร้างความมั่งคั่งจริงจัง',
      content:
        'สิ่งที่ควรทําให้แน่นก่อนก้าวสู่ Stage 3: จาก Stage 1: วินัยออม + Need vs Want + Human Assets จาก Stage 2: DCA + กองทุน + SMART Goal + Net Worth track Stage 3 ( วัยทํางาน ) จะเรียน : → DCA เต็มรูปแบบ : เพิ่มจํานวนและกระจาย Asset Class มากขึ้น → ภาษีเงินได้ : วางแผนภาษีให้ดี RMF/SSF/LTF → Life Events: บ้านรถแต่งงานลูก — วางแผนเงินก้อนใหญ่ → ประกัน : ครอบคลุมมากขึ้นชีวิตสุขภาพทรัพย์สิน → เส้นทางความมั่งคั่ง : จาก Net Worth ติดลบสู่ Net Worth บวกมั่นคงเป้าหมาย Stage 3: Wealth Accumulation → เร่งให้เงินเติบโต',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 4,
      questions: [
        {
          questionText:
            'ทักษะจาก Stage 1-2 ข้อใดสําคัญที่สุดก่อนเริ่ม Stage 3?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รู้ว่ากองทุนไหนกําไรสูงสุด',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'วินัยออมและลงทุนสมํ่าเสมอ + ติดตาม Net Worth สมํ่าเสมอ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'มีเงินเดือนสูงกว่า 50,000 บาท',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'มีบัญชี DCA มากกว่า 5 กองทุน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText: 'Stage 3 วัยทํางานจะเน้นเรื่องอะไรเพิ่มจาก Stage 2?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กลับมาเรียนพื้นฐาน Need vs Want อีกครั้ง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'DCA เต็มรูปภาษี Life Events ประกันและการเร่งสร้างความมั่งคั่ง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'การเก็งกําไรหุ้นระยะสั้น',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เลิกออมเพื่อใช้ชีวิตมากขึ้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'FinTech ไทย : เทคโนโลยีที่เปลี่ยนการเงิน 🌐 Financial Knowledge',
      description:
        'FinTech ทําให้บริการการเงินเข้าถึงได้ง่ายขึ้นรู้จักผู้เล่นสําคัญในไทยช่วยใช้บริการได้ถูกต้อง',
      content:
        'FinTech (Financial Technology) ในไทย : ชําระเงิน : PromptPay, TrueMoney Wallet, Rabbit LINE Pay, AirPay ลงทุน : Finnomena, Jitta Wealth, StockRadars, Robinhood ( หุ้น ) สินเชื่อ : SCB Easy, KBank, Teewee, WeLend ประกัน : Sunday, Roojai, FWD Online บัญชีดิจิทัล : KBank, SCB, Krungthai, TTB ผลกระทบ FinTech ต่อผู้บริโภค : → ค่าธรรมเนียมตํ่าลงหรือฟรี ( โอนเงิน PromptPay ฟรี ) → เข้าถึงบริการลงทุนด้วยเงินน้อย ( กองทุน 1 บาทก็ลงทุนได้ ) → ข้อมูลและ Dashboard ครบในแอปเดียวความเสี่ยง : Cyber security สําคัญต้องปกป้องข้อมูลส่วนตัว',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 4,
      questions: [
        {
          questionText: 'FinTech ด้านการลงทุนในไทยช่วยผู้ลงทุนรายย่อยอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ทําให้หุ้นราคาถูกลง',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ทําให้เข้าถึงการลงทุนได้ด้วยเงินน้อยค่าธรรมเนียมตํ่าและข้อมูลครบ',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'รับประกันผลตอบแทน 10% / ปี',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'กําจัดความเสี่ยงจากการลงทุน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'ความเสี่ยงสําคัญที่ต้องระวังเมื่อใช้ FinTech คืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'FinTech มักล้มละลายภายใน 1 ปี',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'Cybersecurity — ต้องปกป้องข้อมูลส่วนตัวและรหัสผ่านอย่างเข้มงวด',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'FinTech ไม่ได้รับการกํากับดูแล',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ค่าธรรมเนียมซ่อนเร้นสูงมาก',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Final Review: กองทุนรวม',
      description: 'ทบทวนความรู้กองทุนรวมทั้งหมดจาก Stage 2 ก่อน Final Review',
      content:
        'สรุปกองทุนรวม Stage 2: ประเภท : ตลาดเงิน → ตราสารหนี้ → ผสม → หุ้น → Index → RMF/SSF → FIF เลือกกองทุนดูอะไร : Policy + TER + ผลตอบแทนย้อนหลัง + ขนาด + ผู้จัดการ NAV: ราคาหน่วยลงทุน = ( สินทรัพย์ − หนี้สิน ) ÷ หน่วยทั้งหมด DCA กองทุน : ลง 2,000 บาท / เดือน 12 เดือน → ผลตอบแทน 10.51% ( ตัวอย่าง WMD1401) Rebalancing: ปรับปีละครั้งหรือเมื่อสัดส่วนเบี้ยว >5-10% Index Fund ดีอย่างไร : ค่าธรรมเนียมตํ่ากระจายเสี่ยงอัตโนมัติผลตอบแทนใกล้ตลาด RMF/SSF: ลดหย่อนภาษีได้แต่ต้องถือตามเงื่อนไข',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ทําไม Index Fund จึงเป็นตัวเลือกที่ดีสําหรับนักลงทุนมือใหม่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ให้ผลตอบแทนสูงกว่ากองทุนแอคทีฟเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ค่าธรรมเนียมตํ่ากระจายเสี่ยงอัตโนมัติไม่ต้องวิเคราะห์หุ้นเอง',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ไม่มีความเสี่ยงใดๆ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'รัฐบาลคํ้าประกันผลตอบแทน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            'TER 2% ต่อปีกับ TER 0.3% ต่อปีหลังจาก 20 ปีต่างกันอย่างไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ต่างกันแค่ 1.7% ไม่มีนัยสําคัญ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ต่างกันมากเพราะ TER หักทบต้นทุกปีผลตอบแทนสุทธิต่างกันหลายแสนบาทในระยะยาว',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'TER สูงหมายถึงผู้จัดการดีกว่า',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'TER ไม่มีผลต่อผลตอบแทนระยะยาว',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Final Review Stage 2: ครบทุกบท',
      description:
        'ทบทวนสิ่งสําคัญที่สุดจากทุกสัปดาห์ใน Stage 2 ก่อนผ่านไปสู่ Stage 3',
      content:
        'สรุป Stage 2 ทั้งหมด : W5 — Money Management: กฎ 50/30/20 | Net Worth | SMART Goal | Emergency Fund W6 — Investing Basics: เงินเฟ้อ > ดอกเบี้ยเงินฝาก | หุ้น | กองทุน | DCA | Diversification W7 — Stock Market: เลือกหุ้น | P/E | Volatility | FOMO/Panic | Dividend | Bear/Bull W8 — Funds Complete: กองทุนประเภทต่างๆ | NAV | Rebalancing | RMF/SSF | Asset Allocation หลักการที่จําต้องได้ : → เงินเฟ้อคือศัตรู → ต้องลงทุนให้ชนะ → DCA คือวิธีที่ดีที่สุดสําหรับคนมีรายได้ประจํา → Time in Market > Timing the Market → Diversification ลดความเสี่ยงโดยไม่ลดผลตอบแทนมาก',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 5,
      questions: [
        {
          questionText: 'หลักการที่สําคัญที่สุดจาก Stage 2 คืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'เลือกหุ้นให้ถูกต้องเสมอ',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'ลงทุนสมํ่าเสมอ (DCA) ในสินทรัพย์ที่ผลตอบแทนชนะเงินเฟ้อและถือระยะยาว',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'รอจังหวะตลาดที่ดีที่สุดก่อนลงทุน',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ลงทุนในสินทรัพย์ที่ปลอดภัย 100% เท่านั้น',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
        {
          questionText:
            '"Time in Market > Timing the Market" สรุปใจความสําคัญคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'ต้องลงทุนในช่วงเวลาทําการตลาดเท่านั้น',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'การลงทุนให้นานสําคัญกว่าการพยายามเดาจังหวะซื้อ - ขาย',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ต้องลงทุนวันละหลายครั้ง',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ตลาดหุ้นเปิด 24 ชั่วโมง',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Financial Freedom: เส้นทางสู่อิสรภาพ',
      description:
        'Financial Freedom ไม่ใช่แค่ฝันแต่คือเป้าหมายที่คํานวณได้และทําได้ถ้าเริ่มต้นเร็วพอ',
      content:
        'Financial Freedom คืออะไร : = สถานะที่ Passive Income ≥ ค่าใช้จ่าย (Wealth Ratio ≥ 1) คํานวณเป้าหมาย (4% Rule): เงินที่ต้องมี = ค่าใช้จ่ายต่อปี ÷ 4% ตัวอย่าง : ใช้เดือนละ 30,000 บาท / เดือน = 360,000 บาท / ปี → ต้องมีสินทรัพย์ 360,000 ÷ 4% = 9,000,000 บาท → ถอน 4% / ปี = 360,000 บาท ≈ พอใช้โดยไม่หมดเส้นทาง : อายุ 22 → DCA 5,000 บาท / เดือน @ 8% / ปี → อายุ 52 ปี (30 ปี ): มีเงินประมาณ 6,800,000 บาท → อายุ 55 ปี (33 ปี ): ประมาณ 8,900,000 บาท → ใกล้ถึงแล้ว ! สรุป : เริ่มเร็ว + DCA สมํ่าเสมอ + ผลตอบแทนชนะเงินเฟ้อ = Financial Freedom',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 5,
      questions: [
        {
          questionText:
            'ตาม 4% Rule ถ้าต้องการ Passive Income เดือนละ 25,000 บาทต้องมีสินทรัพย์เท่าไหร่ ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: '3,000,000 บาท', isCorrect: false, orderNo: 1 },
              { choiceText: '5,000,000 บาท', isCorrect: false, orderNo: 2 },
              { choiceText: '7,500,000 บาท', isCorrect: true, orderNo: 3 },
              { choiceText: '10,000,000 บาท', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText:
            'วิธีที่ดีที่สุดในการเดินทางสู่ Financial Freedom สําหรับวัยนักศึกษาคืออะไร ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'รอให้ได้งานเงินเดือนสูงก่อน',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เริ่ม DCA ตั้งแต่วันนี้แม้จะน้อยเพราะเวลาและดอกเบี้ยทบต้นทํางานให้',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ลงทุน Crypto ให้ได้ผลตอบแทนเร็ว',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'ออมเงินสด 100% ไม่ลงทุน',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
    {
      title: 'สรุปเครื่องมือทางการเงินที่ควรรู้ 🌐 Financial Knowledge',
      description:
        'รวม Checklist เครื่องมือทางการเงินทั้งหมดที่วัยนักศึกษาควรมีหรือรู้จักก่อนเริ่มทํางาน',
      content:
        'Checklist เครื่องมือการเงินที่ควรมีเมื่อจบ Stage 2: บัญชีธนาคาร : ✓ บัญชีออมทรัพย์หลัก ( รับเงินเดือน + ใช้จ่าย ) ✓ บัญชีออมทรัพย์แยก (Emergency Fund) การลงทุน : ✓ บัญชีกองทุนรวม (DCA กองทุน Index) ✓ กองทุน RMF หรือ SSF ( ถ้าเสียภาษี ) ✓ บัญชี DCA หุ้นหรือกองทุนหุ้น ( ระยะยาว ) ประกัน : ✓ ประกันสุขภาพ (IPD + OPD) ✓ ประกันชีวิต ( ถ้ามีผู้พึ่งพา ) การจัดการภาษี : ✓ ยื่นภาษีทุกปีผ่าน efiling.rd.go.th ✓ เก็บหลักฐานค่าลดหย่อนทั้งหมดติดตาม : ✓ คํานวณ Net Worth ทุก 6 เดือน ✓ Review Budget ทุกสิ้นเดือน',
      rewardCoins: 12000,
      difficulty: 'EASY',
      isSystem: true,
      status: QuestStatus.PUBLISHED,
      weekNum: 8,
      dayNum: 5,
      questions: [
        {
          questionText:
            'เครื่องมือทางการเงินข้อใดที่ควรมีเป็นอันดับแรกก่อนสิ่งอื่น ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 1,
          points: 5,
          choices: {
            create: [
              { choiceText: 'บัญชีกองทุน RMF', isCorrect: false, orderNo: 1 },
              {
                choiceText: 'บัญชีออมทรัพย์แยกสําหรับ Emergency Fund',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'ประกันชีวิตสะสมทรัพย์',
                isCorrect: false,
                orderNo: 3,
              },
              { choiceText: 'บัญชีหุ้น', isCorrect: false, orderNo: 4 },
            ],
          },
        },
        {
          questionText: 'ทําไมต้องยื่นภาษีประจําปีแม้นายจ้างหักภาษีให้แล้ว ?',
          questionType: QuizQuestionType.SINGLE_CHOICE,
          gradingType: QuizGradingType.AUTO,
          orderNo: 2,
          points: 5,
          choices: {
            create: [
              {
                choiceText: 'กฎหมายบังคับให้ยื่นซํ้า',
                isCorrect: false,
                orderNo: 1,
              },
              {
                choiceText:
                  'เพื่อใช้สิทธิ์ค่าลดหย่อนทั้งหมดและอาจได้รับเงินภาษีคืน',
                isCorrect: true,
                orderNo: 2,
              },
              {
                choiceText: 'เพื่อให้ได้รับบัตรสวัสดิการแห่งรัฐ',
                isCorrect: false,
                orderNo: 3,
              },
              {
                choiceText: 'เพราะภาษีที่หักไว้ใช้ไม่ได้',
                isCorrect: false,
                orderNo: 4,
              },
            ],
          },
        },
      ],
    },
  ];

  // Seed all quests
  for (const sq of syllabusQuests) {
    const { startAt, deadlineAt } = getQuestDate(sq.weekNum, sq.dayNum);
    await upsertQuestWithQuiz({
      title: sq.title,
      description: sq.description,
      content: sq.content,
      rewardCoins: sq.rewardCoins,
      difficulty: sq.difficulty,
      isSystem: sq.isSystem,
      status: sq.status,
      startAt,
      deadlineAt,
      questions: sq.questions,
    });
  }

  console.log(`✅ Seeded ${syllabusQuests.length} syllabus quests (W5-W8)`);
}

module.exports = { seedQuizzes };
