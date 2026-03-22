// import { Injectable, Logger } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { Prisma } from '@prisma/client';

// @Injectable()
export class SavingsInterestService {
  //   private readonly logger = new Logger(SavingsInterestService.name);
  //   constructor(private readonly prisma: PrismaService) {}
  //   /**
  //    * Biweekly cron job
  //    * Runs every 2 weeks at 00:00 Sunday
  //    */
  //   @Cron('0 0 0 1,15 * *')
  //   async handleBiweeklyInterest() {
  //     this.logger.log('Running biweekly savings interest job');
  //     const accounts = await this.prisma.savingsAccount.findMany({
  //       include: {
  //         bank: true,
  //       },
  //     });
  //     for (const account of accounts) {
  //       await this.applyInterest(account);
  //     }
  //     this.logger.log('Savings interest job completed');
  //   }
  //   private async applyInterest(account: any) {
  //     const balance = new Prisma.Decimal(account.balance);
  //     const rate = new Prisma.Decimal(account.bank.interestRate);
  //     if (balance.lte(0) || rate.lte(0)) return;
  //     const interest = balance.mul(rate);
  //     if (interest.lte(0)) return;
  //     await this.prisma.$transaction(async (tx) => {
  //         // 1️⃣ insert log
  //         await tx.savingsInterestLog.create({
  //         data: {
  //             savingsAccountId: account.id,
  //             amount: interest,
  //             rateApplied: rate,
  //         },
  //         });
  //         // 2️⃣ update balance
  //         await tx.savingsAccount.update({
  //         where: { id: account.id },
  //         data: {
  //             balance: {
  //             increment: interest,
  //             },
  //         },
  //         });
  //     });
  //     }
}
