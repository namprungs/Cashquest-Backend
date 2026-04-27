/**
 * Seed Learning Modules
 */

async function seedLearningModules(prisma, academicData) {
  const { term } = academicData;

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
    const existing = await prisma.learningModule.findFirst({
      where: { title: moduleSeed.title, termId: term.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.learningModule.update({
        where: { id: existing.id },
        data: moduleSeed,
      });
    } else {
      await prisma.learningModule.create({
        data: { ...moduleSeed, termId: term.id },
      });
    }
  }

  console.log('📚 Learning modules seeded');
}

module.exports = { seedLearningModules };
