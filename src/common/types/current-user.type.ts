import type { User } from '@prisma/client';

export type CurrentUser = User & { role?: { name?: string } | null };
