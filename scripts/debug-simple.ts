import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

(async () => {
  try {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });

    console.log('✓ Pool created');

    const adapter = new PrismaPg(pool);
    console.log('✓ Adapter created');

    const prisma = new PrismaClient({ adapter });
    console.log('✓ PrismaClient created');

    const term = await prisma.term.findFirst();
    console.log('✓ Database connected');
    console.log('✓ First term:', term?.id);

    await prisma.$disconnect();
    await pool.end();
    console.log('✓ Test completed');
  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  }
})();
