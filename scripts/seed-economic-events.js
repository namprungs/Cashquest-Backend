/**
 * Seed Economic Events and Term Events
 */

const { EconomicEventType, TermEventStatus } = require('@prisma/client');

async function seedEconomicEvents(prisma, academicData) {
  console.log('🎲 กำลังสร้าง 16 economic events และ randomize assignments...');

  const { term, totalWeeks } = academicData;

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
    },
    {
      title: 'Tech Earnings Rally',
      description: 'ผลประกอบการกลุ่มเทคออกมาดีกว่าคาด',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.06,
        sigmaAdjustment: 0.01,
      },
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
    },
    {
      title: 'Earnings Beat Surprise',
      description: 'บริษัทใหญ่หลายแห่งรายงานผลกำไรสูงกว่าคาด',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.08,
        sigmaAdjustment: 0.02,
      },
    },
    {
      title: 'Inflation Data Release',
      description: 'ข้อมูลเงินเฟ้อสูงกว่าที่คาดการณ์',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        sigmaAdjustment: 0.06,
        muAdjustment: -0.02,
      },
    },
    {
      title: 'Corporate Scandal',
      description: 'บริษัทใหญ่เผชิญกับวิกฤตความเชื่อมั่น',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.12,
        sigmaAdjustment: 0.08,
      },
    },
    {
      title: 'Interest Rate Cut',
      description: 'ธนาคารกลางลดอัตราดอกเบี้ยเพื่อเร้าเศรษฐกิจ',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.05,
        sigmaAdjustment: -0.01,
      },
    },
    {
      title: 'Stock Market Correction',
      description: 'ตลาดหุ้นปรับตัวปกติหลังการขึ้นราคาอย่างรวดเร็ว',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        muAdjustment: -0.05,
        sigmaAdjustment: 0.05,
      },
    },
    {
      title: 'GDP Growth Announcement',
      description: 'รายงานการเติบโตทางเศรษฐกิจมีสัญญาณบวก',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.07,
        sigmaAdjustment: 0.01,
      },
    },
    {
      title: 'Tech Buyout Frenzy',
      description: 'รอบการซื้อกิจการบริษัทเทคโนโลยี',
      eventType: EconomicEventType.SECTOR_SPECIFIC,
      defaultImpact: {
        muAdjustment: 0.09,
        targetSectors: ['TECH'],
      },
    },
    {
      title: 'Unemployment Report Surge',
      description: 'อัตราการว่างงานเพิ่มขึ้นอย่างไม่คาดคิด',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.08,
        sigmaAdjustment: 0.07,
      },
    },
    {
      title: 'Retail Sales Boom',
      description: 'ยอดขายปลีกเพิ่มขึ้นสะท้อนความเชื่อมั่นผู้บริโภค',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.06,
        targetSectors: ['CONSUMER', 'RETAIL'],
      },
    },
    {
      title: 'Fed Minutes Release',
      description: 'นาทีการประชุมของธนาคารกลางเปิดเผยมุมมองการนโยบายการเงิน',
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        sigmaAdjustment: 0.04,
      },
    },
    {
      title: 'Trade War Escalation',
      description: 'ความตึงเณรรายศาสตร์การค้าระหว่างประเทศเพิ่มขึ้น',
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        muAdjustment: -0.1,
        sigmaAdjustment: 0.1,
      },
    },
    {
      title: 'Housing Data Positive',
      description: 'ข้อมูลตัวอักษรบ้านและที่ดินออกมาแข็งแกร่ง',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.04,
        targetSectors: ['REAL_ESTATE', 'CONSTRUCTION'],
      },
    },
    {
      title: 'Fed Balance Sheet Shift',
      description: 'การเปลี่ยนแปลงนโยบายการดำเนินการด้านความสมดุลของธนาคารกลาง',
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        muAdjustment: 0.03,
        sigmaAdjustment: -0.02,
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
    [shuffledEvents[i], shuffledEvents[j]] = [shuffledEvents[j], shuffledEvents[i]];
  }

  // Assign events to weeks 1-16
  const termTotalWeeks = Math.min(16, totalWeeks);
  for (let week = 1; week <= termTotalWeeks; week++) {
    const eventIndex = (week - 1) % shuffledEvents.length;
    await prisma.termEvent.create({
      data: {
        termId: term.id,
        eventId: shuffledEvents[eventIndex].id,
        startWeek: week,
        endWeek: week,
        status: TermEventStatus.PENDING,
      },
    });
  }

  console.log(`✅ สร้างเหตุการณ์ 16 อย่างและกำหนดให้กับสัปดาห์ 1-${termTotalWeeks}`);
}

module.exports = { seedEconomicEvents };
