# 🎮 Gamified Financial Literacy Platform

> **Technology Stack:** NestJS (Modular Monolith) · Prisma ORM · PostgreSQL

เอกสารนี้อธิบายโครงสร้างโปรเจกต์ แนวคิดการออกแบบ และบทบาทของแต่ละ Module อย่างละเอียด
เพื่อให้ **คนใหม่ที่ไม่เคยเห็นระบบนี้มาก่อน** สามารถเข้าใจภาพรวมและเริ่มพัฒนาได้ทันที

---

## 🧠 แนวคิดหลักของระบบ (Big Picture)

แพลตฟอร์มนี้เป็น **เกมจำลองการวางแผนการเงินสำหรับนักเรียน** โดยมีแนวคิดสำคัญคือ:

* นักเรียนมี **ชีวิตทางการเงิน (LifeStage)** ที่เปลี่ยนไปตามเวลา
* มีเงินสด (Wallet) และระบบธนาคาร (Banking)
* ทุกอย่างขับเคลื่อนด้วย “เวลาในเกม” ที่ Admin ตั้งค่าไว้ล่วงหน้า

ระบบจึงถูกออกแบบให้:

* 🧱 แยก Domain ชัดเจน (Admin / Operation / Gameplay / Finance)
* 🔄 คำนวณสถานะแบบ Dynamic (ไม่เก็บข้อมูลซ้ำ)
* 🔐 ปลอดภัยต่อธุรกรรมทางการเงิน (Atomic Transaction)

---

## 🏗️ Core Architecture

### Modular Monolith คืออะไร?

เราใช้ **Modular Monolith** หมายถึง:

* เป็นแอปเดียว (ไม่ใช่ Microservices)
* แต่แบ่งโค้ดเป็น Module ตาม Domain อย่างเข้มงวด
* แต่ละ Module มี Controller / Service / DTO ของตัวเอง

ข้อดี:

* เข้าใจง่ายกว่า Microservices
* Refactor และ Scale ในอนาคตได้ง่าย
* ยังบังคับ Boundary ระหว่าง Domain ได้ดี

---

## 📁 โครงสร้างโฟลเดอร์หลัก

```text
src/
├── common/                  # ของที่ใช้ร่วมกันทั้งโปรเจกต์
│   ├── decorators/          # @CurrentUser(), @Roles()
│   ├── guards/              # JwtAuthGuard, RolesGuard, TermActiveGuard
│   ├── filters/             # Global Exception Filters
│   └── utils/               # Date helpers, formatters
│
├── modules/
│   ├── auth/                # 🔐 Authentication (Login, JWT)
│   ├── user/                # 👤 User Account + Roles
│   ├── school/              # 🏛️ Admin Configuration (Time & Rules)
│   ├── classroom/           # 🏫 Teacher & Student Operations
│   ├── player/              # 🎮 Game State & LifeStage Calculation
│   └── finance/             # 💰 Wallet + Bank System
│
├── app.module.ts            # Root Module
└── main.ts                  # Application Entry Point
```

---

## 🏛️ 1. School Module (Admin Zone)

### 🎯 หน้าที่ของ Module นี้

School Module เป็น **เจ้าของเวลาและกฎของเกมทั้งหมด**

Admin ใช้ Module นี้เพื่อ:

* สร้างโรงเรียน
* สร้างเทอม (Term)
* สร้างสัปดาห์ในเทอม (TermWeek)
* กำหนดว่าแต่ละช่วงเวลา = LifeStage อะไร

> 🔑 **Module อื่น “ห้ามแก้เวลา” ได้เอง — ทำได้แค่ Query**

### 📦 Entities ที่เกี่ยวข้อง

* `School`
* `Term`
* `TermWeek`
* `LifeStage`
* `TermStageRule`

### 📁 โครงสร้างภายใน

```text
school/
├── controllers/
│   ├── school.controller.ts       # CRUD โรงเรียน
│   ├── term.controller.ts         # สร้าง Term + Generate Weeks
│   └── rule-setup.controller.ts   # Admin ตั้ง Week → LifeStage
├── services/
│   ├── school.service.ts
│   ├── term.service.ts            # สร้าง TermWeek อัตโนมัติ
│   └── life-stage-def.service.ts  # Master Data ของ LifeStage
├── dto/
│   ├── create-term.dto.ts
│   └── set-stage-rules.dto.ts
└── school.module.ts
```

---

## 🏫 2. Classroom Module (Operational Zone)

### 🎯 หน้าที่ของ Module นี้

Classroom Module ดูแล **การใช้งานจริงในแต่ละวัน** เช่น:

* ครูสร้างห้องเรียน
* นักเรียนเข้าห้องด้วย Code
* ดูรายชื่อนักเรียนในห้อง

### ❓ ทำไมต้องแยกจาก School?

| School          | Classroom         |
| --------------- | ----------------- |
| ตั้งค่าล่วงหน้า | ใช้งานทุกวัน      |
| เปลี่ยนน้อย     | เปลี่ยนบ่อย       |
| Admin           | Teacher / Student |

### 📦 Entities

* `Classroom`
* `ClassroomStudent`

### 📁 โครงสร้างภายใน

```text
classroom/
├── controllers/
│   └── classroom.controller.ts
├── services/
│   └── classroom.service.ts
├── dto/
│   ├── create-classroom.dto.ts
│   └── join-classroom.dto.ts
└── classroom.module.ts
```

---

## 🎮 3. Player Module (Game State)

### 🎯 หน้าที่ของ Module นี้

Player Module คือ **ศูนย์กลางข้อมูลของนักเรียนแต่ละคน**

ดูแล:

* Student Profile
* Retirement Goals
* การคำนวณ LifeStage แบบ Real-time

### 🧠 แนวคิดสำคัญ: LifeStage ไม่ถูกเก็บใน DB

> ❌ ไม่เก็บ `currentLifeStage`
> ✅ คำนวณจาก `วันนี้` + `TermWeek` + `TermStageRule`

ข้อดี:

* ข้อมูลไม่ผิดเพี้ยน
* เปลี่ยนกฎย้อนหลังได้
* Debug ง่าย

### 📦 Entities

* `StudentProfile`
* `RetirementGoal`

### 📁 โครงสร้างภายใน

```text
player/
├── controllers/
│   ├── student-profile.controller.ts  # GET /me
│   └── goal.controller.ts
├── services/
│   ├── student-profile.service.ts
│   ├── life-stage-calc.service.ts     # 🧠 Core Calculator
│   └── retirement-goal.service.ts
├── dto/
│   └── ...
└── player.module.ts
```

---

## 💰 4. Finance Module (Money Hub)

### 🎯 หน้าที่ของ Module นี้

Finance Module เป็น **ที่เดียวที่เงินถูกแก้ไขได้**

ดูแล:

* Wallet (เงินสด)
* Bank (Savings / Fixed Deposit)
* Transaction Log
* ดอกเบี้ย

### ❓ ทำไมต้องรวม Wallet + Bank?

เพื่อรองรับ:

* Atomic Transaction
* ความถูกต้องทางการเงิน

ตัวอย่าง:

> ฝากเงิน = Wallet -100 + Bank +100
> → ต้องสำเร็จหรือพังพร้อมกัน

### 📦 Entities

* `Wallet`
* `WalletTransaction`
* `Bank`
* `SavingsAccount`
* `FixedDeposit`

### 📁 โครงสร้างภายใน

```text
finance/
├── controllers/
│   ├── wallet.controller.ts
│   └── bank.controller.ts
├── services/
│   ├── wallet.service.ts
│   ├── bank.service.ts
│   └── transaction-logger.service.ts
├── tasks/
│   └── interest-scheduler.task.ts
├── dto/
│   ├── deposit.dto.ts
│   └── transfer.dto.ts
└── finance.module.ts
```

---

## 🔄 ตัวอย่าง Flow การทำงาน

### ผู้เล่นเข้าเกม

1. `StudentProfileController`
2. เรียก `LifeStageCalcService`
3. เรียก `WalletService`
4. รวมข้อมูล → ส่งหน้า Dashboard

### ฝากเงินเข้าธนาคาร

1. `BankController`
2. `BankService.deposit()`
3. `WalletService.deduct()`
4. ทั้งหมดอยู่ใน `prisma.$transaction`

### Admin สร้างเทอมใหม่

1. `TermController`
2. `TermService.create()`
3. สร้าง `Term` + `TermWeek`

---

## 🏆 สรุป: ทำไมโครงสร้างนี้ถึงดี

* 📦 Domain ชัดเจน ไม่ปนกัน
* 🔄 Logic คำนวณ Dynamic ลด Bug
* 💰 การเงินปลอดภัยและตรวจสอบได้
* 🧠 คนใหม่อ่านแล้วเข้าใจ Flow ได้ทันที

> โครงสร้างนี้พร้อมสำหรับการเขียนโค้ดจริง, ขยายฟีเจอร์ในอนาคต และดูแลระยะยาว 🚀
