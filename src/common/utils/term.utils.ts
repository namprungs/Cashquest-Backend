import { PrismaService } from 'src/prisma/prisma.service';

export async function getCurrentWeekNo(
  prisma: PrismaService,
  termId: string,
): Promise<number | null> {
  const term = await prisma.term.findUnique({
    where: { id: termId },
    select: { startDate: true, totalWeeks: true },
  });
  if (!term) return null;

  const now = new Date();
  const termWeek = await prisma.termWeek.findFirst({
    where: {
      termId,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { weekNo: true },
  });
  if (termWeek) return termWeek.weekNo;

  const diffDays = Math.floor(
    (now.getTime() - term.startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), term.totalWeeks);
}
