/**
 * Seed Users (Admin, Teacher, Student, Staff)
 */

const bcrypt = require('bcrypt');

async function seedUsers(prisma, roles) {
  console.log('👤 กำลังจัดการบัญชี Super Admin...');

  const adminEmail = 'admin@school.com';
  const hashedAdminPassword = await bcrypt.hash('Admin@1234', 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: roles.superAdminRole.id,
    },
    create: {
      email: adminEmail,
      username: 'superadmin',
      password: hashedAdminPassword,
      roleId: roles.superAdminRole.id,
    },
  });

  const defaultPassword = await bcrypt.hash('Teacher@1234', 10);
  const studentPassword = await bcrypt.hash('Student@1234', 10);
  const staffPassword = await bcrypt.hash('Staff@1234', 10);

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@school.com' },
    update: {
      username: 'teacher_demo',
      roleId: roles.teacherRole.id,
      isActive: true,
    },
    create: {
      email: 'teacher@school.com',
      username: 'teacher_demo',
      password: defaultPassword,
      roleId: roles.teacherRole.id,
      isActive: true,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@school.com' },
    update: {
      username: 'student_demo',
      roleId: roles.studentRole.id,
      isActive: true,
    },
    create: {
      email: 'student@school.com',
      username: 'student_demo',
      password: studentPassword,
      roleId: roles.studentRole.id,
      isActive: true,
    },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@school.com' },
    update: {
      username: 'staff_demo',
      roleId: roles.staffRole.id,
      isActive: true,
    },
    create: {
      email: 'staff@school.com',
      username: 'staff_demo',
      password: staffPassword,
      roleId: roles.staffRole.id,
      isActive: true,
    },
  });

  const student2User = await prisma.user.upsert({
    where: { email: 'student2@school.com' },
    update: {
      username: 'student_demo_2',
      roleId: roles.studentRole.id,
      isActive: true,
    },
    create: {
      email: 'student2@school.com',
      username: 'student_demo_2',
      password: studentPassword,
      roleId: roles.studentRole.id,
      isActive: true,
    },
  });

  const student3User = await prisma.user.upsert({
    where: { email: 'student3@school.com' },
    update: {
      username: 'student_demo_3',
      roleId: roles.studentRole.id,
      isActive: true,
    },
    create: {
      email: 'student3@school.com',
      username: 'student_demo_3',
      password: studentPassword,
      roleId: roles.studentRole.id,
      isActive: true,
    },
  });

  return { teacherUser, studentUser, staffUser, student2User, student3User };
}

module.exports = { seedUsers };
