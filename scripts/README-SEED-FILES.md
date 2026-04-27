# Modular Seed Files Documentation

This directory contains modular seed files that break down the database seeding process into logical, reusable components. The original `prisma/seed.ts` remains unchanged.

## File Structure

```
scripts/
├── seed-orchestrator.js          # Master orchestration file (runs all seeds in order)
├── seed-permissions-roles.js     # Permissions and role assignments
├── seed-users.js                 # User creation (admin, teacher, student, staff)
├── seed-academic.js              # School, terms, classrooms, life stages
├── seed-learning-modules.js      # Learning module content
├── seed-quests.js                # Quests and quest submissions
├── seed-banks.js                 # Banks and their configs (Savings & Fixed Deposit)
├── seed-badges.js                # Badge definitions and awards
├── seed-market-products.js       # Stock products for market simulation
├── seed-economic-events.js       # Economic events and term events
├── seed-market-regimes.js        # Market regimes (Bull, Bear, Sideways)
├── seed-product-prices.js        # Product price simulation and term simulation
└── verify_term_events.js         # Utility to verify term events (existing)
```

## Usage

### Option 1: Run All Seeds via Orchestrator (Recommended)

```bash
node scripts/seed-orchestrator.js
```

This runs all seeds in the correct dependency order:
1. Permissions & Roles
2. Users
3. Academic (School, Term, Classrooms, Stages)
4. Learning Modules
5. Quests
6. Banks
7. Badges
8. Market Products
9. Economic Events
10. Market Regimes
11. Term Simulation
12. Product Prices

### Option 2: Run Individual Seeds (For Testing/Development)

You can also import individual seed functions programmatically:

```javascript
const { PrismaClient } = require('@prisma/client');
const { seedBanks } = require('./scripts/seed-banks');
const { seedAcademic } = require('./scripts/seed-academic');

const prisma = new PrismaClient();

async function testBankSeeding() {
  const academicData = await seedAcademic(prisma, {
    teacherUser: { id: '...' },
    studentUser: { id: '...' },
    staffUser: { id: '...' }
  });
  
  const banks = await seedBanks(prisma, academicData);
  console.log('Banks:', banks);
}
```

### Option 3: Keep Using Original seed.ts

The original `prisma/seed.ts` remains unchanged and can still be used:

```bash
pnpm prisma db seed
```

## Data Dependencies

```
Permissions & Roles
    ↓
    └──→ Users
         ↓
         └──→ Academic (School, Term, Classrooms)
              ↓
              ├──→ Learning Modules
              ├──→ Quests
              ├──→ Banks
              ├──→ Badges
              ├──→ Market Products
              │    ↓
              │    └──→ Economic Events
              │    └──→ Market Regimes
              │    └──→ Product Prices
              │         └──→ Term Simulation
              └──→ ...
```

## Seeded Data Summary

### Users Created
- **Admin**: admin@school.com / Admin@1234
- **Teacher**: teacher@school.com / Teacher@1234
- **Student**: student@school.com / Student@1234
- **Staff**: staff@school.com / Staff@1234

### Academic Setup
- **School**: CashQuest Demo School
- **Term**: Demo Term 1/2026 (16 weeks)
- **Classroom**: มัธยมศึกษาปีที่ 6/4
- **Life Stages**: 4 stages (Student → Graduate → Working → Retired)

### Financial System
**Banks** (1-to-1 with Savings/Fixed Deposit Configs):
1. ธนาคารยินดี (0.75% savings, 1.75% FD for 3 weeks)
2. ธนาควรพอใจ (1.00% savings, 2.00% FD for 6 weeks)
3. ธนาคารใจเย็น (1.25% savings, 3.00% FD for 9 weeks)

### Market Data
- **3 Stock Products**: CQTECH (high risk), CQGROW (medium), CQDIV (low)
- **16 Economic Events**: Randomly assigned to weeks
- **3 Market Regimes**: Bull (weeks 1-5), Bear (6-10), Sideways (11-16)
- **Price History**: Generated using geometric Brownian motion for 6 weeks

### Quests
- 1 Interactive: Open savings account
- 4 Learning: Finance basics, budgeting, expense tracking, investment analysis

### Badges
- 4 Badge definitions (4 types)
- Demo student awarded 2 badges on creation

## Extending the Seeds

To add a new seed category:

1. Create `scripts/seed-{category}.js`
2. Export async function: `seedYourCategory(prisma, requiredData)`
3. Return relevant data for downstream seeds
4. Import in `seed-orchestrator.js`
5. Call with proper dependencies in correct order

Example:
```javascript
// scripts/seed-rewards.js
async function seedRewards(prisma, academicData) {
  console.log('🎁 Seeding rewards...');
  // Your logic here
  console.log('✅ Rewards seeded');
  return { rewards };
}

module.exports = { seedRewards };
```

Then in `seed-orchestrator.js`:
```javascript
const { seedRewards } = require('./seed-rewards');
// ... after seedBadges ...
await seedRewards(prisma, academicData);
```

## Verification

Use `verify_term_events.js` to check term events:
```bash
node scripts/verify_term_events.js
```

View in Prisma Studio:
```bash
pnpm prisma studio
```
