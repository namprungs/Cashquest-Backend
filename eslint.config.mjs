// eslint.config.mjs
// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // ข้ามไฟล์ config เอง
  { ignores: ['eslint.config.mjs'] },

  // base JS
  eslint.configs.recommended,

  // TypeScript แบบ type-aware (จะใส่ parser ให้ด้วย)
  ...tseslint.configs.recommendedTypeChecked,

  // Prettier (ให้เตือนเมื่อ format ไม่ตรง)
  eslintPluginPrettierRecommended,

  // ค่าเริ่มต้นสำหรับทุกไฟล์ .ts
  {
    files: ['**/*.ts'],
    languageOptions: {
      // ให้หา tsconfig อัตโนมัติ (เหมาะกับ CI/monorepo)
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // ปรับ/ปิดกฎตามที่ต้องการ
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',

      // (↓) อันที่คุณอยากลดความเข้ม
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off', // ถ้าต้องการ
    },
  },

  // เฉพาะไฟล์ DTO (ยอมผ่อนกฎที่มักชน cast/validation)
  {
    files: ['**/*.dto.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  }
);
