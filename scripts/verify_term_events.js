(async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const term = await prisma.term.findFirst();
    if (!term) {
      console.log('No term found');
      process.exit(0);
    }
    const events = await prisma.termEvent.findMany({
      where: { termId: term.id },
      select: {
        id: true,
        startWeek: true,
        endWeek: true,
        status: true,
        event: { select: { title: true } },
      },
      orderBy: { startWeek: 'asc' },
    });

    console.log(JSON.stringify({ termId: term.id, events }, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
})();
