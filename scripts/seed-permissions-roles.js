/**
 * Seed Permissions and Roles
 * Handles creation of all permissions and role assignments
 */

const path = require('path');
const fsPromises = require('fs').promises;

// ✅ Load PERMISSIONS constant dynamically
let PERMISSIONS = null;

async function loadPermissions() {
  if (PERMISSIONS) return PERMISSIONS;

  try {
    // Try to load from compiled dist first
    const permissionsPath = path.resolve(
      __dirname,
      '../dist/common/constants/permissions.constant.js',
    );
    const module = await import('file://' + permissionsPath);
    PERMISSIONS = module.PERMISSIONS;
    return PERMISSIONS;
  } catch (e1) {
    console.warn(
      '⚠️  Could not load from dist, trying direct import...',
      e1.message,
    );
    // Fallback: define minimal permissions inline for testing
    PERMISSIONS = {
      USER: {
        CREATE: 'USER_CREATE',
        EDIT: 'USER_EDIT',
        DELETE: 'USER_DELETE',
        VIEW_ALL: 'USER_VIEW_ALL',
        VIEW_SELF: 'USER_VIEW_SELF',
        ASSIGN_ROLE: 'USER_ASSIGN_ROLE',
      },
      ACADEMIC: {
        SCHOOL_CREATE: 'ACADEMIC_SCHOOL_CREATE',
        SCHOOL_EDIT: 'ACADEMIC_SCHOOL_EDIT',
        SCHOOL_VIEW: 'ACADEMIC_SCHOOL_VIEW',
        SCHOOL_DELETE: 'ACADEMIC_SCHOOL_DELETE',
        TERM_CREATE: 'ACADEMIC_TERM_CREATE',
        TERM_VIEW: 'ACADEMIC_TERM_VIEW',
        TERM_EDIT: 'ACADEMIC_TERM_EDIT',
        TERM_PUBLISH: 'ACADEMIC_TERM_PUBLISH',
        TERM_COMPLETE: 'ACADEMIC_TERM_COMPLETE',
        TERM_DELETE: 'ACADEMIC_TERM_DELETE',
        TERM_MANAGE: 'ACADEMIC_TERM_MANAGE',
        CLASS_MANAGE: 'ACADEMIC_CLASS_MANAGE',
        CLASS_CREATE: 'ACADEMIC_CLASS_CREATE',
        LIFESTAGE_CREATE: 'ACADEMIC_LIFESTAGE_CREATE',
        LIFESTAGE_EDIT: 'ACADEMIC_LIFESTAGE_EDIT',
        LIFESTAGE_VIEW: 'ACADEMIC_LIFESTAGE_VIEW',
        LIFESTAGE_DELETE: 'ACADEMIC_LIFESTAGE_DELETE',
        TERM_STAGE_RULE_CREATE: 'ACADEMIC_TERM_STAGE_RULE_CREATE',
        TERM_STAGE_RULE_EDIT: 'ACADEMIC_TERM_STAGE_RULE_EDIT',
        TERM_STAGE_RULE_VIEW: 'ACADEMIC_TERM_STAGE_RULE_VIEW',
        TERM_STAGE_RULE_DELETE: 'ACADEMIC_TERM_STAGE_RULE_DELETE',
        CLASSROOM_CREATE: 'ACADEMIC_CLASSROOM_CREATE',
        CLASSROOM_VIEW: 'ACADEMIC_CLASSROOM_VIEW',
        CLASSROOM_EDIT: 'ACADEMIC_CLASSROOM_EDIT',
        CLASSROOM_DELETE: 'ACADEMIC_CLASSROOM_DELETE',
      },
      SIMULATION: {
        PLAY: 'SIM_PLAY',
        CONTENT_MANAGE: 'SIM_CONTENT_MANAGE',
        REPORT_VIEW: 'SIM_REPORT_VIEW',
        REWARD_APPROVE: 'SIM_REWARD_APPROVE',
      },
      PLAYER: {
        BOOTSTRAP: 'PLAYER_BOOTSTRAP',
      },
      SYSTEM: {
        CONFIG: 'SYSTEM_CONFIG',
        LOG_VIEW: 'SYSTEM_LOG_VIEW',
      },
    };
    return PERMISSIONS;
  }
}

async function seedPermissionsAndRoles(prisma) {
  console.log('📦 กำลังบันทึก Permissions...');

  await loadPermissions();
  const allPermissionNames = Object.values(PERMISSIONS).flatMap((group) =>
    Object.values(group),
  );

  const permissionMap = new Map();

  for (const name of allPermissionNames) {
    const perm = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    permissionMap.set(name, perm.id);
  }

  // Helper function to create/update role
  const upsertRole = async (roleName, permissions) => {
    console.log(`🎭 กำลังจัดการ Role: ${roleName}`);

    const permissionIds = permissions
      .map((name) => permissionMap.get(name))
      .filter((id) => !!id);

    const rolePermissionsData = permissionIds.map((id) => ({
      permissionId: id,
    }));

    return await prisma.role.upsert({
      where: { name: roleName },
      update: {
        rolePermissions: {
          deleteMany: {},
          create: rolePermissionsData,
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

  // Create roles with appropriate permissions
  const superAdminRole = await upsertRole('SUPER_ADMIN', allPermissionNames);

  const staffRole = await upsertRole('STAFF', [
    PERMISSIONS.USER.CREATE,
    PERMISSIONS.USER.EDIT,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.ACADEMIC.SCHOOL_VIEW,
    PERMISSIONS.ACADEMIC.SCHOOL_EDIT,
  ]);

  const teacherRole = await upsertRole('TEACHER', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.ACADEMIC.CLASS_MANAGE,
    PERMISSIONS.ACADEMIC.TERM_MANAGE,
    PERMISSIONS.SIMULATION.CONTENT_MANAGE,
    PERMISSIONS.ACADEMIC.CLASSROOM_CREATE,
    PERMISSIONS.ACADEMIC.CLASSROOM_VIEW,
    PERMISSIONS.ACADEMIC.CLASSROOM_EDIT,
    PERMISSIONS.ACADEMIC.CLASSROOM_DELETE,
  ]);

  const studentRole = await upsertRole('STUDENT', [
    PERMISSIONS.USER.VIEW_SELF,
    PERMISSIONS.SIMULATION.PLAY,
  ]);

  return { superAdminRole, staffRole, teacherRole, studentRole };
}

module.exports = { seedPermissionsAndRoles, loadPermissions };
