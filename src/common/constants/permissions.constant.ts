// src/common/constants/permissions.constant.ts

export const PERMISSIONS = {
  // --- กลุ่มจัดการผู้ใช้งาน (User Management) ---
  USER: {
    CREATE: 'USER_CREATE', // สร้างบัญชี (Staff/Admin ใช้)
    EDIT: 'USER_EDIT', // แก้ไขข้อมูลผู้อื่น
    DELETE: 'USER_DELETE', // ลบบัญชี
    VIEW_ALL: 'USER_VIEW_ALL', // ดูรายชื่อคนทั้งโรงเรียน
    VIEW_SELF: 'USER_VIEW_SELF', // ดูโปรไฟล์ตัวเอง (ทุกคนต้องมี)
    ASSIGN_ROLE: 'USER_ASSIGN_ROLE', // เปลี่ยน Role ให้คนอื่น (Super Admin)
  },

  // --- กลุ่มวิชาการและการจัดการโรงเรียน (Academic) ---
  ACADEMIC: {
    SCHOOL_CREATE: 'ACADEMIC_SCHOOL_CREATE', // สร้างโรงเรียน
    SCHOOL_EDIT: 'ACADEMIC_SCHOOL_EDIT', // แก้ข้อมูลโรงเรียน
    SCHOOL_VIEW: 'ACADEMIC_SCHOOL_VIEW', // ดูข้อมูลโรงเรียน
    SCHOOL_DELETE: 'ACADEMIC_SCHOOL_DELETE', // ลบโรงเรียน
    TERM_CREATE: 'ACADEMIC_TERM_CREATE',
    TERM_VIEW: 'ACADEMIC_TERM_VIEW', // ดูข้อมูลเทอม/ปีการศึกษา
    TERM_EDIT: 'ACADEMIC_TERM_EDIT', // แก้ไขข้อมูลเทอม/ปีการศึกษา
    TERM_PUBLISH: 'ACADEMIC_TERM_PUBLISH', // เผยแพร่เทอม/ปีการศึกษา
    TERM_COMPLETE: 'ACADEMIC_TERM_COMPLETE', // ปิดเทอม/ปีการศึกษา
    TERM_DELETE: 'ACADEMIC_TERM_DELETE', // ลบเทอม/ปีการศึกษา
    TERM_MANAGE: 'ACADEMIC_TERM_MANAGE', // จัดการเทอม/ปีการศึกษา
    CLASS_MANAGE: 'ACADEMIC_CLASS_MANAGE', // จัดการห้องเรียน/ตารางสอน
    CLASS_CREATE: 'ACADEMIC_CLASS_CREATE', // จัดการห้องเรียน/ตารางสอน
    LIFESTAGE_CREATE: 'ACADEMIC_LIFESTAGE_CREATE', // สร้างช่วงวัย
    LIFESTAGE_EDIT: 'ACADEMIC_LIFESTAGE_EDIT', // แก้ไขช่วงวัย
    LIFESTAGE_VIEW: 'ACADEMIC_LIFESTAGE_VIEW', // ดูช่วงวัย
    LIFESTAGE_DELETE: 'ACADEMIC_LIFESTAGE_DELETE', // ลบช่วงวัย
    TERM_STAGE_RULE_CREATE: 'ACADEMIC_TERM_STAGE_RULE_CREATE', // สร้างกฎช่วงวัยเทอม
    TERM_STAGE_RULE_EDIT: 'ACADEMIC_TERM_STAGE_RULE_EDIT', // แก้ไขกฎช่วงวัยเทอม
    TERM_STAGE_RULE_VIEW: 'ACADEMIC_TERM_STAGE_RULE_VIEW', // ดูกฎช่วงวัยเทอม
    TERM_STAGE_RULE_DELETE: 'ACADEMIC_TERM_STAGE_RULE_DELETE', // ลบกฎช่วงวัยเทอม
  },

  // --- กลุ่มระบบจำลอง (Simulation) ---
  SIMULATION: {
    PLAY: 'SIM_PLAY', // สิทธิ์ในการเล่น (Student)
    CONTENT_MANAGE: 'SIM_CONTENT_MANAGE', // จัดการเนื้อหา/ด่าน (Teacher/Admin)
    REPORT_VIEW: 'SIM_REPORT_VIEW', // ดูรายงานผลการเล่น
    REWARD_APPROVE: 'SIM_REWARD_APPROVE', // อนุมัติรางวัล/แต้ม
  },

  // --- กลุ่มตั้งค่าระบบ (System - สำหรับ Super Admin) ---
  SYSTEM: {
    CONFIG: 'SYSTEM_CONFIG', // ตั้งค่า Core ระบบ
    LOG_VIEW: 'SYSTEM_LOG_VIEW', // ดู Log การใช้งานทั้งหมด
  },
} as const;

// สร้าง Type จากค่าใน Object เพื่อใช้ทำ Type Checking ในอนาคต
export type PermissionValue = {
  [Key in keyof typeof PERMISSIONS]: (typeof PERMISSIONS)[Key] extends Record<
    string,
    infer V
  >
    ? V
    : never;
}[keyof typeof PERMISSIONS];
