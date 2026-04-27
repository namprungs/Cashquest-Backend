/**
 * Seed Badges
 */

async function seedBadges(prisma, academicData) {
  console.log('🏅 กำลังสร้างข้อมูล badges สำหรับเทอมหลัก...');

  const { term, demoStudentProfile } = academicData;

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
        ruleJson: badgeSeed.ruleJson,
      },
      create: {
        termId: term.id,
        code: badgeSeed.code,
        name: badgeSeed.name,
        description: badgeSeed.description,
        ruleJson: badgeSeed.ruleJson,
      },
    });

    // Award badge to demo student if specified
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

  console.log(`✅ ${badgeSeeds.length} badges seeded`);
}

module.exports = { seedBadges };
