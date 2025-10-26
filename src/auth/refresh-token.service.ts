// src/auth/refresh-token.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

export type TokenMeta = Partial<{ ip: string; ua: string; deviceId: string }>;

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService, // ใช้ทำ Access Token ต่อไปได้ตามปกติ
  ) {}

  /**
   * สุ่ม refresh token แบบปลอดภัย (plaintext) แล้วแฮชด้วย SHA256
   */
  private generatePlainRefreshToken(): string {
    // 48 bytes ≈ 64 base64url chars (เพียงพอ)
    return crypto.randomBytes(48).toString('base64url');
  }

  private hashToken(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  private getRefreshTtlMs(): number {
    const ms = Number(this.config.get('JWT_REFRESH_TOKEN_EXPIRATION_MS'));
    if (!Number.isFinite(ms) || ms <= 0) {
      // สำรอง 14 วัน
      return 14 * 24 * 60 * 60 * 1000;
    }
    return ms;
  }

  private computeRefreshExpiry(): Date {
    return new Date(Date.now() + this.getRefreshTtlMs());
  }

  /**
   * ออก Refresh Token ใหม่ให้ผู้ใช้คนหนึ่ง
   * - คืนทั้ง plaintext (ให้ client) และ record ที่บันทึกใน DB (hash)
   */
  async issue(userId: string, meta?: TokenMeta) {
    try {
      const plain = this.generatePlainRefreshToken();
      const tokenHash = this.hashToken(plain);

      const rec = await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt: this.computeRefreshExpiry(),
          createdByIp: meta?.ip,
          userAgent: meta?.ua,
          deviceId: meta?.deviceId,
        },
      });

      // ส่งเฉพาะ plaintext RT ให้ client เก็บ (secure storage)
      return { refreshToken: plain, record: rec };
    } catch {
      throw new BadRequestException('Unable to issue refresh token');
    }
  }

  /**
   * หมุน (rotate) Refresh Token เดิมเป็นตัวใหม่
   * - รับ plaintext RT เก่า (จากมือถือ)
   * - ตรวจว่าใช้ได้ -> ออกตัวใหม่ -> revoke ตัวเก่า + ผูก replacedById
   * - คืน plaintext RT ใหม่ (ให้ client เก็บแทนตัวเดิม)
   */
  async rotate(oldPlainRt: string, meta?: TokenMeta) {
    const oldHash = this.hashToken(oldPlainRt);

    const old = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: oldHash },
    });
    if (!old || old.revokedAt || old.expiresAt <= new Date()) {
      throw new NotFoundException('Invalid refresh token');
    }

    const { refreshToken: newPlain, record: next } = await this.issue(
      old.userId,
      {
        ip: meta?.ip,
        ua: meta?.ua,
        deviceId: meta?.deviceId,
      },
    );

    await this.prisma.refreshToken.update({
      where: { id: old.id },
      data: {
        revokedAt: new Date(),
        replacedById: next.id,
        lastUsedAt: new Date(),
        lastUsedIp: meta?.ip,
      },
    });

    return { refreshToken: newPlain, record: next };
  }

  /**
   * เพิกถอน RT รายตัวด้วย plaintext (เช่น logout อุปกรณ์นี้)
   */
  async revokeByPlain(plain: string) {
    const hash = this.hashToken(plain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * เพิกถอน RT ทั้งหมดของผู้ใช้ (เช่นเปลี่ยนรหัสผ่าน / logout ทุกเครื่อง)
   */
  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
