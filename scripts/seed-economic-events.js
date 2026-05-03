/**
 * Seed Economic Events and Term Events
 */

const { EconomicEventType, TermEventStatus } = require('@prisma/client');

async function seedEconomicEvents(prisma, academicData) {
  console.log('🎲 กำลังสร้าง 16 economic events และ randomize assignments...');

  const { term, totalWeeks } = academicData;

  const economicEventConfigs = [
    {
      title:
        'สำนักงานสถิติแห่งชาติรายงาน \nCPI เดือนนี้พุ่ง 5.2% สูงกว่าคาดที่ 3.8%',
      description: `• ราคาอาหาร พลังงาน และสินค้าอุปโภคบริโภคปรับสูงขึ้นพร้อมกัน
• ตลาดคาด กนง. อาจขึ้นดอกเบี้ยในการประชุมครั้งถัดไปเพื่อสกัดเงินเฟ้อ
• อำนาจซื้อของผู้บริโภคลดลง เงินที่เก็บไว้ซื้อสินค้าได้น้อยลง
`,
      imageUrl: 'http://localhost:3000/uploads/1777576531099-cpi.png',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        global: { muAdjustment: -0.02, sigmaAdjustment: 0.05 },
        assets: {
          L1: { mu: 0.0 },
          L2: { mu: 0.0 },
          M1: { mu: 0.02 },
          M2: { mu: 0.0, sigma: 0.02 },
          H1: { mu: -0.05, sigma: 0.05 },
          H2: { mu: -0.04 },
          B1: { mu: -0.03 },
        },
      },
    },

    {
      title: 'กนง. ขึ้นดอกเบี้ย',
      description: `• กนง. ขึ้นดอกเบี้ยนโยบาย ทุนไหลออกจากตลาดเกิดใหม่
•ดอกเบี้ยออมทรัพย์ขึ้น
•ดอกเบี้ยฝากประจำที่ฝากอยู่แล้ว — เท่าเดิม  |  offer ใหม่ — ขึ้น
• ตราสารหนี้ที่ถืออยู่แล้ว — ดอกเบี้ยเท่าเดิม  |  offer ใหม่ — ขึ้น
• หุ้นลง มูลค่า port ลง  |  DCA ได้หน่วยเพิ่มขึ้น
`,
      imageUrl: 'http://localhost:3000/uploads/1777576341408-a-a-a.jpg',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        global: { muAdjustment: -0.08, sigmaAdjustment: 0.1 },
        assets: {
          L1: { mu: -0.02 },
          L2: { mu: -0.02 },
          M1: { mu: -0.03 },
          M2: { mu: 0.0, sigma: 0.03 },
          H1: { mu: -0.12, sigma: 0.1 },
          H2: { mu: -0.12, sigma: 0.1 },
          B1: { mu: -0.05 },
        },
      },
    },

    {
      title: 'หุ้น Tech กำไรเกินคาด',
      description: `• TechWave (H1) ประกาศกำไรสุทธิไตรมาสล่าสุดสูงกว่าคาดถึง 40%
• นักลงทุนต่างชาติไหลเข้าหุ้น tech ไทย sector rotation เข้า growth stocks
• ดัชนีหุ้น tech ปรับตัวขึ้นแรง GameHub ได้ sentiment บวกไปด้วย
• หุ้น defensive ไม่ได้รับ sentiment บวกมากนัก
`,
      imageUrl: 'http://localhost:3000/uploads/1777576021960-TECH-STOCK.webp',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        global: { muAdjustment: 0.05 },
        assets: {
          H1: { mu: 0.15 },
          H2: { mu: 0.12 },
          M2: { mu: 0.02 },
          B1: { mu: -0.02 },
        },
      },
    },

    {
      title: 'GDP ขยายตัวดีกว่าคาด',
      description: `• สภาพัฒน์รายงาน GDP ไตรมาสล่าสุดขยายตัว 4.8% สูงกว่าคาดที่ 3.5%
• ภาคการส่งออกและบริการท่องเที่ยวฟื้นตัวแข็งแกร่ง
• ความเชื่อมั่นนักลงทุนเพิ่มขึ้น เม็ดเงินต่างชาติไหล เข้าตลาดหุ้นไทย
• ตลาดหุ้นโดยรวมปรับตัวขึ้นพร้อมกัน
`,
      imageUrl: 'http://localhost:3000/uploads/1777576070074-gdp.jpg',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        global: { muAdjustment: 0.07, sigmaAdjustment: -0.02 },
        assets: {
          L1: { mu: 0.02 },
          L2: { mu: 0.02 },
          M1: { mu: 0.04 },
          M2: { mu: 0.04 },
          H1: { mu: 0.08 },
          H2: { mu: 0.05 },
          B1: { mu: -0.02 },
        },
      },
    },

    {
      title: 'ค่าเงินบาท อ่อนค่า',
      description: `• ค่าเงินบาทอ่อนค่าจาก 33 บาท/ดอลล์ เป็น 36 บาท/ดอลล์ ในเวลาสั้น
• นักลงทุนต่างชาติ net sell หุ้นไทย เงินทุนไหลออกสู่ตลาดดอกเบี้ยสูง
• บริษัทที่รายได้เป็น USD ได้ประโยชน์ เมื่อแปลงกลับเป็นบาทได้มากขึ้น
• บริษัทที่นำเข้าวัตถุดิบต้นทุนพุ่ง กระทบ margin
`,
      imageUrl: 'http://localhost:3000/uploads/1777576122876-baht_weak.webp',
      eventType: EconomicEventType.SECTOR_SPECIFIC,
      defaultImpact: {
        assets: {
          H1: { mu: 0.04 },
          H2: { mu: 0.04 },
          M2: { mu: -0.02 },
        },
      },
    },

    {
      title: 'ราคาน้ำมันพุ่ง',
      description: `• ราคาน้ำมันดิบโลกพุ่ง 25% จากการลดกำลังการผลิตของ OPEC+
• ต้นทุนโลจิสติกส์และพลังงานพุ่งสูง ทุกธุรกิจได้รับผลกระทบ
• GreenPower (M1) ซึ่งเน้นพลังงานทดแทนกลายเป็นหุ้นที่น่าสนใจมากขึ้น
• ผู้บริโภคมีภาระค่าน้ำมันสูงขึ้น กระทบ disposable income
`,
      imageUrl:
        'http://localhost:3000/uploads/1777576229956-a-a-2a-a-a-1-a-2a-a-a-a-1-a-2a-a-2569-05-01-a-1-a-a-a-2-02.09.57.png',
      eventType: EconomicEventType.SECTOR_SPECIFIC,
      defaultImpact: {
        assets: {
          M1: { mu: 0.08 },
          H2: { mu: -0.04 },
          L1: { mu: -0.02 },
        },
      },
    },

    {
      title: 'ค่าแรงขั้นต่ำขึ้น',
      description: `• รัฐบาลประกาศขึ้นค่าแรงขั้นต่ำ 15% มีผลเดือนหน้า
• บริษัทที่ใช้แรงงานจำนวนมากต้นทุนพุ่ง margin ลด
• ผู้มีรายได้น้อยมีกำลังซื้อมากขึ้น consumer spending ในสินค้าจำเป็นดีขึ้น
• ธุรกิจ tech และ digital ใช้แรงงานน้อยกว่า ได้รับผลกระทบน้อย
`,
      imageUrl:
        'http://localhost:3000/uploads/1777576310502-a-a-a-1-a-a-a-1-a-2a-a-1-a-2a.jpg',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        assets: {
          L1: { mu: -0.02 },
          L2: { mu: -0.03 },
        },
      },
    },

    {
      title: 'กนง. ลดดอกเบี้ย',
      description: `• กนง. มีมติลดดอกเบี้ยนโยบาย เพื่อกระตุ้นเศรษฐกิจที่ชะลอตัว
• ดอกเบี้ยเงินฝากออมทรัพย์ลดลงทันที ฝากประจำที่ฝากอยู่เท่าเดิมจนครบกำหนด
• ตลาดหุ้นตอบรับบวก cost of capital ลด การลงทุนง่ายขึ้น
• ตราสารหนี้ที่ถืออยู่ราคาขึ้น (yield ลด)  offer ใหม่ผลตอบแทนลดลง
• DCA ได้หน่วยน้อยลง (ราคาหุ้นขึ้น)
`,
      imageUrl: 'http://localhost:3000/uploads/1777576341408-a-a-a.jpg',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        global: { muAdjustment: 0.08 },
        assets: {
          H1: { mu: 0.12 },
          H2: { mu: 0.1 },
          M2: { mu: 0.05 },
          B1: { mu: 0.04 },
        },
      },
    },

    {
      title: 'กนง. คงดอกเบี้ย',
      description: `• ตลาดคาดว่า กนง. จะขึ้นดอกเบี้ย แต่ กนง. มีมติ "คงดอกเบี้ย" แบบเซอร์ไพรส์
• กนง. มองเศรษฐกิจยังต้องการการสนับสนุน ไม่รีบขึ้นดอก
• ตลาดหุ้นเกิด "relief rally" ความไม่แน่นอนลดลงทันที
• นักลงทุนที่เตรียม short bond ขาดทุน ราคา bond ขึ้นกะทันหัน
`,
      imageUrl: 'http://localhost:3000/uploads/1777576341408-a-a-a.jpg',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        assets: {
          H1: { mu: 0.05 },
          B1: { mu: 0.04 },
        },
      },
    },

    {
      title: 'GameHub รายงานขาดทุน',
      description: `• GameHub (H2) รายงานผลประกอบการ: ขาดทุนสุทธิ 450 ล้านบาท แย่กว่าคาดมาก
• ยอดผู้ใช้งานลด ต้นทุนพัฒนาเกมใหม่สูงเกินแผน
• หุ้น H2 ร่วงแรงทันที ลาก sentiment หุ้น tech/growth อื่นลงด้วย
• นักลงทุนตั้งคำถามว่าหุ้น high-risk "คุ้มค่า" หรือไม่
`,
      imageUrl: 'http://localhost:3000/uploads/1777576371202-game.jpg',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        assets: {
          H2: { mu: -0.15, sigma: 0.1 },
          H1: { mu: -0.03 },
        },
      },
    },

    {
      title: 'HealthPlus อนุมัติ Telehealth',
      description: `• HealthPlus (L2) ได้รับอนุมัติจาก สปสช. ให้บริการ Telehealth แบบครบวงจรทั่วประเทศ
• เปิดตลาดใหม่โดยไม่ต้องขยายสาขา margin ดีขึ้นมาก
• ราคาหุ้น L2 ตอบรับบวกแรง เป็น catalyst เฉพาะตัว
• หุ้นตัวอื่นไม่ได้รับผลกระทบโดยตรง
`,
      imageUrl: 'http://localhost:3000/uploads/1777576418237-health.jpg',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        assets: {
          L2: { mu: 0.12, sigma: -0.02 },
        },
      },
    },

    {
      title: 'GreenPower ชนะประมูลโซลาร์',
      description: `• GreenPower (M1) ชนะประมูลโครงการผลิตไฟฟ้าโซลาร์ภาครัฐ มูลค่า 8,000 ล้านบาท
• สัญญา 20 ปี รายได้มั่นคง ลด risk ของบริษัทในระยะยาว
• ตลาดตอบรับดี M1 ขึ้น sector sentiment พลังงานสีเขียวดีขึ้น
• หุ้น sector อื่นไม่ได้รับผลกระทบโดยตรง
`,
      imageUrl: 'http://localhost:3000/uploads/1777576444294-solar.jpg',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        assets: {
          M1: { mu: 0.1, sigma: -0.03 },
        },
      },
    },
  ];

  // Create or find all economic events
  const allEvents = [];
  for (const config of economicEventConfigs) {
    const existing = await prisma.economicEvent.findFirst({
      where: { title: config.title },
      select: { id: true },
    });

    if (existing) {
      const updated = await prisma.economicEvent.update({
        where: { id: existing.id },
        data: {
          description: config.description,
          imageUrl: config.imageUrl ?? null,
          eventType: config.eventType,
          defaultImpact: config.defaultImpact,
          isRepeatable: true,
        },
      });
      allEvents.push({ id: updated.id });
    } else {
      const created = await prisma.economicEvent.create({
        data: {
          title: config.title,
          description: config.description,
          imageUrl: config.imageUrl ?? null,
          eventType: config.eventType,
          defaultImpact: config.defaultImpact,
          isRepeatable: true,
        },
      });
      allEvents.push({ id: created.id });
    }
  }

  // Delete existing term events
  await prisma.termEvent.deleteMany({ where: { termId: term.id } });

  // Shuffle events randomly for this term (Fisher-Yates)
  const shuffledEvents = [...allEvents];
  for (let i = shuffledEvents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledEvents[i], shuffledEvents[j]] = [
      shuffledEvents[j],
      shuffledEvents[i],
    ];
  }

  // Get current market week from term simulation
  const termSim = await prisma.termSimulation.findUnique({
    where: { termId: term.id },
  });
  const currentWeek = termSim?.currentWeek ?? 1;

  // Assign events to weeks 1-16 with proper status based on current week
  const termTotalWeeks = Math.min(16, totalWeeks);
  for (let week = 1; week <= termTotalWeeks; week++) {
    const eventIndex = (week - 1) % shuffledEvents.length;

    // Determine status based on current week (same logic as EventStatusScheduler)
    let status;
    if (currentWeek > week + 1) {
      // After active period (1 week after endWeek), mark as expired
      status = TermEventStatus.EXPIRED;
    } else if (currentWeek === week + 1) {
      // 1 week after endWeek, mark as active (peak impact on prices)
      status = TermEventStatus.ACTIVE;
    } else if (currentWeek >= week && currentWeek <= week) {
      // During event period, mark as announced (learning/awareness period)
      status = TermEventStatus.ANNOUNCED;
    } else {
      // Before event starts
      status = TermEventStatus.SCHEDULED;
    }

    await prisma.termEvent.create({
      data: {
        termId: term.id,
        eventId: shuffledEvents[eventIndex].id,
        startWeek: week,
        endWeek: week,
        status,
      },
    });
  }

  console.log(
    `✅ สร้างเหตุการณ์ 16 อย่างและกำหนดให้กับสัปดาห์ 1-${termTotalWeeks} (current week: ${currentWeek})`,
  );
}

module.exports = { seedEconomicEvents };
