// 1. Load Environment Variables ทันที
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
// ตรวจสอบ Path นี้ให้ถูกต้องตามโครงสร้างโปรเจกต์ของคุณ

// 2. สร้าง Connection Pool และ Adapter
const connectionString = `${process.env.DATABASE_URL}`;

// ตรวจสอบว่ามี URL หรือไม่ ป้องกัน Error แปลกๆ
if (!connectionString || connectionString === 'undefined') {
  throw new Error('❌ DATABASE_URL is missing. Please check your .env file.');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 3. ส่ง adapter เข้าไปใน PrismaClient
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 เริ่มต้นการ Seed ข้อมูล...');

  // --- Logic การ Seed ข้อมูล ---

  // 1. ดึงข้อมูลสิทธิ์ทั้งหมดจาก Constant มาเป็น Array แบนๆ
  const allPermissionNames = Object.values(PERMISSIONS).flatMap((group) =>
    Object.values(group),
  );

  // 2. สร้าง/อัปเดต Permissions
  console.log('📦 กำลังบันทึก Permissions...');
  const permissionMap = new Map<string, string>();

  for (const name of allPermissionNames) {
    const perm = await prisma.permission.upsert({
      where: { name: name as string },
      update: {},
      create: { name },
    });
    permissionMap.set(name, perm.id);
  }

  // 3. ฟังก์ชันสร้าง Role และผูกสิทธิ์
  const upsertRole = async (roleName: string, permissions: string[]) => {
    console.log(`🎭 กำลังจัดการ Role: ${roleName}`);

    // แปลงชื่อ Permission เป็น ID
    const permissionIds = permissions
      .map((name) => permissionMap.get(name))
      .filter((id): id is string => !!id);

    // เตรียม Data สำหรับ create หรือ update relation
    const rolePermissionsData = permissionIds.map((id) => ({
      permissionId: id,
    }));

    return await prisma.role.upsert({
      where: { name: roleName },
      update: {
        rolePermissions: {
          deleteMany: {}, // ลบสิทธิ์เก่าทิ้งก่อน
          create: rolePermissionsData, // ใส่สิทธิ์ใหม่ที่ถูกต้อง
        },
      },
      create: {
        name: roleName,
        rolePermissions: {
          create: rolePermissionsData,
        },
      },
    });
  };

  // 4. กำหนด Role และสิทธิ์ตามต้องการ
  const superAdminRole = await upsertRole('SUPER_ADMIN', allPermissionNames);

  await upsertRole('STAFF', [
    PERMISSIONS.USER.CREATE,
    PERMISSIONS.USER.EDIT,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.ACADEMIC.SCHOOL_VIEW,
    PERMISSIONS.ACADEMIC.SCHOOL_EDIT,
  ]);

  await upsertRole('TEACHER', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.ACADEMIC.CLASS_MANAGE,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.SIMULATION.CONTENT_MANAGE,
    PERMISSIONS.ACADEMIC.CLASSROOM_CREATE,
    PERMISSIONS.ACADEMIC.CLASSROOM_VIEW,
    PERMISSIONS.ACADEMIC.CLASSROOM_EDIT,
    PERMISSIONS.ACADEMIC.CLASSROOM_DELETE,
  ]);

  await upsertRole('STUDENT', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.SIMULATION.PLAY,
  ]);

  // 5. สร้างบัญชี Super Admin
  const adminEmail = 'admin@school.com';
  const hashedAdminPassword = await bcrypt.hash('Admin@1234', 10);

  console.log('👤 กำลังจัดการบัญชี Super Admin...');
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: superAdminRole.id,
    },
    create: {
      email: adminEmail,
      username: 'superadmin',
      password: hashedAdminPassword,
      roleId: superAdminRole.id,
    },
  });

  console.log(`
✨ Seeding Completed!
📧 Admin Email: ${adminEmail}
🔑 Admin Pass: Admin@1234
  `);

  const roleWithPermissions = await prisma.role.findMany({
    include: {
      rolePermissions: {
        // เข้าไปในตารางตัวกลาง (RolePermission)
        include: {
          permission: {
            select: {
              name: true,
            },
          }, // 👈 สำคัญ: ดึงข้อมูลจากตาราง Permission (ที่มีชื่อ) ออกมาด้วย
        },
      },
    },
  });

  // 2. แปลงโครงสร้างข้อมูลให้อ่านง่าย (Flatten)
  const prettyRoles = roleWithPermissions.map((role) => ({
    Role: role.name,
    Permissions: role.rolePermissions.map((rp) => rp.permission.name), // ดึงเฉพาะชื่อออกมา
  }));

  // 3. แสดงผล
  console.log(JSON.stringify(prettyRoles, null, 2));
}

// 4. การจัดการ Process และปิด Connection (สำคัญมากสำหรับ Driver Adapter)
main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end(); // ปิด Pool ของ pg เพื่อให้ Process จบการทำงานได้
  })
  .catch(async (e) => {
    console.error('❌ Seeding Error:', e);
    await prisma.$disconnect();
    await pool.end(); // ปิด Pool กรณี Error ด้วย ไม่งั้น process จะค้าง
    process.exit(1);
  });
