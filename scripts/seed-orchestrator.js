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
const { seedBanks } = require('./seed-banks');
const { seedBadges } = require('./seed-badges');
const { seedMarketProducts } = require('./seed-market-products');
const { seedEconomicEvents } = require('./seed-economic-events');
const { seedMarketRegimes } = require('./seed-market-regimes');
const { seedTermSimulation, seedProductPrices } = require('./seed-product-prices');

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

    // 6. Banks
    console.log('\n=== 6️⃣  BANKS ===');
    await seedBanks(prisma, academicData);

    // 7. Badges
    console.log('\n=== 7️⃣  BADGES ===');
    await seedBadges(prisma, academicData);

    // 8. Market Products
    console.log('\n=== 8️⃣  MARKET PRODUCTS ===');
    const products = await seedMarketProducts(prisma, academicData);

    // 9. Economic Events
    console.log('\n=== 9️⃣  ECONOMIC EVENTS ===');
    await seedEconomicEvents(prisma, academicData);

    // 10. Market Regimes
    console.log('\n=== 🔟 MARKET REGIMES ===');
    await seedMarketRegimes(prisma, academicData);

    // 11. Term Simulation
    console.log('\n=== 1️⃣1️⃣  TERM SIMULATION ===');
    await seedTermSimulation(prisma, academicData);

    // 12. Product Prices
    console.log('\n=== 1️⃣2️⃣  PRODUCT PRICES ===');
    await seedProductPrices(prisma, academicData, products);

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
