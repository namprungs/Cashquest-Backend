/**
 * Seed Orchestrator
 * Master orchestration file that calls all seed modules in correct order
 * Run with: node scripts/seed-orchestrator.js
 */

require('dotenv/config');
const pg = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { seedPermissionsAndRoles } = require('./seed-permissions-roles');
const { seedUsers } = require('./seed-users');
const { seedAcademic } = require('./seed-academic');
const { seedLearningModules } = require('./seed-learning-modules');
const { seedQuests } = require('./seed-quests');
const { seedQuizzes } = require('./seed-quizzes');
const { seedBanks } = require('./seed-banks');
const { seedBadges } = require('./seed-badges');
const { seedMarketProducts } = require('./seed-market-products');
const { seedEconomicEvents } = require('./seed-economic-events');
const { seedMarketRegimes } = require('./seed-market-regimes');
const {
  seedTermSimulation,
  seedProductPrices,
} = require('./seed-product-prices');
const { seedMarketStudents } = require('./seed-market-students');
const { seedExpenseEvents } = require('./seed-expense-events');
const { seedBondPositions } = require('./seed-bond-positions');

// Setup Prisma with PostgreSQL adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString === 'undefined') {
  throw new Error('❌ DATABASE_URL is missing. Please check your .env file.');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 เริ่มต้นการ Seed ข้อมูล (Orchestrated)...\n');

  try {
    // 1. Permissions and Roles
    console.log('\n=== 1️⃣  PERMISSIONS & ROLES ===');
    const roles = await seedPermissionsAndRoles(prisma);

    // 2. Users
    console.log('\n=== 2️⃣  USERS ===');
    const users = await seedUsers(prisma, roles);

    // 3. Academic (School, Term, Classrooms, LifeStages)
    console.log('\n=== 3️⃣  ACADEMIC ===');
    const academicData = await seedAcademic(prisma, users);

    // 4. Learning Modules
    console.log('\n=== 4️⃣  LEARNING MODULES ===');
    await seedLearningModules(prisma, academicData);

    // 5. Quests
    console.log('\n=== 5️⃣  QUESTS ===');
    await seedQuests(prisma, academicData, users);

    // 6. Quizzes
    console.log('\n=== 6️⃣  QUIZZES ===');
    await seedQuizzes(
      prisma,
      academicData,
      users.teacherUser,
      academicData.classroom,
    );

    // 7. Banks
    console.log('\n=== 7️⃣  BANKS ===');
    await seedBanks(prisma, academicData);

    // 8. Badges
    console.log('\n=== 8️⃣  BADGES ===');
    await seedBadges(prisma, academicData);

    // 9. Market Products
    console.log('\n=== 9️⃣  MARKET PRODUCTS ===');
    const products = await seedMarketProducts(prisma, academicData);

    // 10. Term Simulation (must run before economic events so currentWeek is available)
    console.log('\n=== 🔟  TERM SIMULATION ===');
    await seedTermSimulation(prisma, academicData);

    // 11. Economic Events (needs currentWeek from term simulation)
    console.log('\n=== 1️⃣1️⃣  ECONOMIC EVENTS ===');
    await seedEconomicEvents(prisma, academicData);

    // 12. Market Regimes
    console.log('\n=== 1️⃣2️⃣  MARKET REGIMES ===');
    await seedMarketRegimes(prisma, academicData);

    // 13. Product Prices
    console.log('\n=== 1️⃣3️⃣  PRODUCT PRICES ===');
    await seedProductPrices(prisma, academicData, products);

    // 14. Market Students
    console.log('\n=== 1️⃣4️⃣  MARKET STUDENTS ===');
    await seedMarketStudents(
      prisma,
      academicData,
      products,
      academicData.classroom,
      roles,
    );

    // 15. Expense Events
    console.log('\n=== 1️⃣5️⃣  EXPENSE EVENTS ===');
    await seedExpenseEvents(prisma, academicData, academicData.lifeStages);

    // 16. Bond Positions
    console.log('\n=== 1️⃣6️⃣  BOND POSITIONS ===');
    await seedBondPositions(prisma, academicData, products);

    console.log('\n✨ Seeding Completed!\n');
    console.log('📧 Admin Email: admin@school.com');
    console.log('🔑 Admin Pass: Admin@1234');
    console.log('📧 Teacher Email: teacher@school.com / Pass: Teacher@1234');
    console.log('📧 Student Email: student@school.com / Pass: Student@1234');
    console.log('📧 Staff Email: staff@school.com / Pass: Staff@1234');
    console.log('🏫 Demo School: CashQuest Demo School');
    console.log('📚 Demo Term: Demo Term 1/2026');
  } catch (err) {
    console.error('❌ Error during seeding:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(async () => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  });
