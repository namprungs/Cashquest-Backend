/**
 * Seed Economic Events and Term Events
 */

const { EconomicEventType, TermEventStatus } = require('@prisma/client');

async function seedEconomicEvents(prisma, academicData) {
  console.log('🎲 กำลังสร้าง 16 economic events และ randomize assignments...');

  const { term, totalWeeks } = academicData;

  const economicEventConfigs = [
    {
      title: 'CPI Surge Shock',
      description: `CPI พุ่ง 5.2% สูงกว่าคาด เงินเฟ้อกดกำลังซื้อ ตลาดคาดขึ้นดอกเบี้ย
Insight: ลงทุนในสินทรัพย์ที่เอาชนะเงินเฟ้อ อย่าถือเงินสดมากเกิน`,
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
      title: 'Rate Hike Policy',
      description: `กนง. ขึ้นดอกเบี้ย หุ้นลง bond yield ขึ้น
Insight: DCA ต่อ อย่า panic sell`,
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
      title: 'Tech Earnings Beat',
      description: `TechWave กำไร +40% เงินไหลเข้า growth stocks
Insight: ระวัง FOMO`,
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
      title: 'GDP Growth Positive',
      description: `GDP โต 4.8% เงินไหลเข้าตลาดหุ้น
Insight: ถือหุ้นต่อ`,
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
      title: 'THB Weakening',
      description: `เงินบาทอ่อนค่า บริษัท export ได้ประโยชน์
Insight: ถือสินทรัพย์ที่มีรายได้ USD`,
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
      title: 'Oil Price Surge',
      description: `ราคาน้ำมันพุ่ง 25%
Insight: หุ้นพลังงานได้ประโยชน์`,
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
      title: 'Minimum Wage Increase',
      description: `ค่าแรงขึ้น 15%
Insight: ระวัง margin บริษัท`,
      eventType: EconomicEventType.VOLATILITY_SHOCK,
      defaultImpact: {
        assets: {
          L1: { mu: -0.02 },
          L2: { mu: -0.03 },
        },
      },
    },

    {
      title: 'Rate Cut Stimulus',
      description: `กนง. ลดดอกเบี้ย ตลาดหุ้นขึ้น
Insight: เพิ่ม equity`,
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
      title: 'Rate Hold Surprise',
      description: `คงดอกเบี้ยแบบ surprise
Insight: relief rally`,
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        assets: {
          H1: { mu: 0.05 },
          B1: { mu: 0.04 },
        },
      },
    },

    {
      title: 'GameHub Loss Shock',
      description: `GameHub ขาดทุนหนัก
Insight: diversify`,
      eventType: EconomicEventType.MARKET_CRASH,
      defaultImpact: {
        assets: {
          H2: { mu: -0.15, sigma: 0.1 },
          H1: { mu: -0.03 },
        },
      },
    },

    {
      title: 'HealthPlus Telehealth Approval',
      description: `HealthPlus ได้อนุมัติ Telehealth
Insight: catalyst เฉพาะตัว`,
      eventType: EconomicEventType.DRIFT_SHIFT,
      defaultImpact: {
        assets: {
          L2: { mu: 0.12, sigma: -0.02 },
        },
      },
    },

    {
      title: 'GreenPower Solar Win',
      description: `GreenPower ได้โครงการ 20 ปี
Insight: เหมาะ long-term`,
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
    [shuffledEvents[i], shuffledEvents[j]] = [
      shuffledEvents[j],
      shuffledEvents[i],
    ];
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

  console.log(
    `✅ สร้างเหตุการณ์ 16 อย่างและกำหนดให้กับสัปดาห์ 1-${termTotalWeeks}`,
  );
}

module.exports = { seedEconomicEvents };
