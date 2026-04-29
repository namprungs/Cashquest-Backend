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
    CLASSROOM_CREATE: 'ACADEMIC_CLASSROOM_CREATE', // สร้างห้องเรียน
    CLASSROOM_VIEW: 'ACADEMIC_CLASSROOM_VIEW', // ดูห้องเรียน
    CLASSROOM_EDIT: 'ACADEMIC_CLASSROOM_EDIT', // แก้ไขห้องเรียน
    CLASSROOM_DELETE: 'ACADEMIC_CLASSROOM_DELETE', // ลบห้องเรียน
  },

  // --- กลุ่มห้องเรียน (Classroom Flow) ---
  CLASSROOM: {
    CREATE: 'CLASSROOM_CREATE', // สร้างห้องเรียนในเทอม
    VIEW: 'CLASSROOM_VIEW', // ดูรายการ/รายละเอียดห้องเรียน
    STUDENT_MANAGE: 'CLASSROOM_STUDENT_MANAGE', // เพิ่ม/ลบนักเรียนในห้อง
    STUDENT_VIEW: 'CLASSROOM_STUDENT_VIEW', // ดูรายชื่อนักเรียน/overview/detail
    DASHBOARD_VIEW: 'CLASSROOM_DASHBOARD_VIEW', // ดู dashboard/home overview ห้องเรียน
    SUBMISSION_VIEW: 'CLASSROOM_SUBMISSION_VIEW', // ดู pending submissions ในห้อง
  },

  PLAYER: {
    BOOTSTRAP: 'PLAYER_BOOTSTRAP', // สิทธิ์เริ่มต้นเล่นเกม (Student)
    PROFILE_REPORT_VIEW: 'PLAYER_PROFILE_REPORT_VIEW', // ดู student profiles รายเทอม/รายคน
    RETIREMENT_GOAL_MANAGE: 'PLAYER_RETIREMENT_GOAL_MANAGE', // จัดการเป้าหมายเกษียณของตัวเอง
  },

  // --- กลุ่มระบบจำลอง (Simulation) ---
  SIMULATION: {
    PLAY: 'SIM_PLAY', // สิทธิ์ในการเล่น (Student)
    CONTENT_MANAGE: 'SIM_CONTENT_MANAGE', // จัดการเนื้อหา/ด่าน (Teacher/Admin)
    REPORT_VIEW: 'SIM_REPORT_VIEW', // ดูรายงานผลการเล่น
    REWARD_APPROVE: 'SIM_REWARD_APPROVE', // อนุมัติรางวัล/แต้ม
  },

  // --- กลุ่ม Learning Module ---
  LEARNING_MODULE: {
    CREATE: 'LEARNING_MODULE_CREATE',
    VIEW: 'LEARNING_MODULE_VIEW',
    EDIT: 'LEARNING_MODULE_EDIT',
    DELETE: 'LEARNING_MODULE_DELETE',
    PUBLISH: 'LEARNING_MODULE_PUBLISH',
  },

  // --- กลุ่ม Quest ---
  QUEST: {
    CREATE: 'QUEST_CREATE',
    VIEW: 'QUEST_VIEW',
    EDIT: 'QUEST_EDIT',
    DELETE: 'QUEST_DELETE',
    PUBLISH: 'QUEST_PUBLISH',
    CLOSE: 'QUEST_CLOSE',
    VIEW_OWN: 'QUEST_VIEW_OWN',
    SUBMIT: 'QUEST_SUBMIT',
    CLAIM_REWARD: 'QUEST_CLAIM_REWARD',
    SUBMISSION_VIEW: 'QUEST_SUBMISSION_VIEW',
    SUBMISSION_REVIEW: 'QUEST_SUBMISSION_REVIEW',
  },

  // --- กลุ่ม Quiz ---
  QUIZ: {
    CREATE: 'QUIZ_CREATE',
    VIEW: 'QUIZ_VIEW',
    EDIT: 'QUIZ_EDIT',
    DELETE: 'QUIZ_DELETE',
    VIEW_OWN: 'QUIZ_VIEW_OWN',
    ATTEMPT: 'QUIZ_ATTEMPT',
  },

  // --- กลุ่มการเงินในเกม ---
  FINANCE: {
    BANK_VIEW: 'FINANCE_BANK_VIEW',
    BANK_MANAGE: 'FINANCE_BANK_MANAGE',
    BANK_STAT_VIEW: 'FINANCE_BANK_STAT_VIEW',
    SAVINGS_ACCOUNT_MANAGE_OWN: 'FINANCE_SAVINGS_ACCOUNT_MANAGE_OWN',
    SAVINGS_ACCOUNT_VIEW_REPORT: 'FINANCE_SAVINGS_ACCOUNT_VIEW_REPORT',
    FIXED_DEPOSIT_MANAGE_OWN: 'FINANCE_FIXED_DEPOSIT_MANAGE_OWN',
    FIXED_DEPOSIT_VIEW_REPORT: 'FINANCE_FIXED_DEPOSIT_VIEW_REPORT',
    WALLET_VIEW_OWN: 'FINANCE_WALLET_VIEW_OWN',
    DASHBOARD_VIEW_OWN: 'FINANCE_DASHBOARD_VIEW_OWN',
    INTEREST_RUN: 'FINANCE_INTEREST_RUN',
  },

  // --- กลุ่มตลาดลงทุน ---
  INVESTMENT: {
    MARKET_VIEW: 'INVESTMENT_MARKET_VIEW',
    PORTFOLIO_VIEW_OWN: 'INVESTMENT_PORTFOLIO_VIEW_OWN',
    WALLET_MANAGE_OWN: 'INVESTMENT_WALLET_MANAGE_OWN',
    ORDER_MANAGE_OWN: 'INVESTMENT_ORDER_MANAGE_OWN',
    PRODUCT_MANAGE: 'INVESTMENT_PRODUCT_MANAGE',
    SIMULATION_MANAGE: 'INVESTMENT_SIMULATION_MANAGE',
    PRICE_MANAGE: 'INVESTMENT_PRICE_MANAGE',
    EVENT_VIEW: 'INVESTMENT_EVENT_VIEW',
    EVENT_MANAGE: 'INVESTMENT_EVENT_MANAGE',
    REGIME_MANAGE: 'INVESTMENT_REGIME_MANAGE',
    JOB_RUN: 'INVESTMENT_JOB_RUN',
  },

  // --- กลุ่มค่าใช้จ่ายสุ่ม ---
  EXPENSE: {
    VIEW_OWN: 'EXPENSE_VIEW_OWN',
    PAY_OWN: 'EXPENSE_PAY_OWN',
    ACKNOWLEDGE_OWN: 'EXPENSE_ACKNOWLEDGE_OWN',
    TRIGGER: 'EXPENSE_TRIGGER',
  },

  // --- กลุ่ม Badge / Reward ---
  BADGE: {
    VIEW_OWN: 'BADGE_VIEW_OWN',
    MANAGE: 'BADGE_MANAGE',
    AWARD: 'BADGE_AWARD',
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
