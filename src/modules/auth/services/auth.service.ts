// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt'; // ✅ เปลี่ยนเป็น namespace import
import { UserService } from 'src/modules/user/user.service';
import { User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { RefreshTokenService, TokenMeta } from './refresh-token.service';
import { TokenPayload } from '../interfaces/token.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  private async signAccessToken(userId: string) {
    const expiresAccessToken = new Date();
    expiresAccessToken.setMilliseconds(
      expiresAccessToken.getTime() +
        Number(this.configService.get('JWT_ACCESS_TOKEN_EXPIRATION_MS')),
    );

    const tokenPayload: TokenPayload = {
      userId: userId,
    };

    const accessToken = await this.jwtService.signAsync(tokenPayload, {
      secret: this.configService.get('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn: `${this.configService.get('JWT_ACCESS_TOKEN_EXPIRATION_MS')}ms`,
    });
    return { accessToken, expiresAccessToken };
  }

  async verifyUser(email: string, password: string) {
    try {
      const user: User = await this.userService.getUser({ email });
      const authenticated = await bcrypt.compare(password, user.password); // ✅
      if (!authenticated) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return user;
    } catch (e: unknown) {
      if (e instanceof NotFoundException) {
        throw new UnauthorizedException('Invalid credentials');
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async login(user: User, response: Response, meta: TokenMeta) {
    try {
      const { accessToken, expiresAccessToken } = await this.signAccessToken(
        user.id,
      );
      const refreshToken = await this.refreshTokenService.issue(user.id, meta);
      response.cookie('Authentication', accessToken, {
        httpOnly: true,
        secure: true,
        expires: expiresAccessToken,
      });

      return { accessToken, refreshToken: refreshToken.refreshToken };
    } catch {
      throw new BadRequestException();
    }
  }

  async logout(oldRefreshToken: string) {
    const res = await this.refreshTokenService.revokeByPlain(oldRefreshToken);
    return { success: res };
  }

  async refresh(oldrefreshToken: string, meta: TokenMeta) {
    const { refreshToken, record } = await this.refreshTokenService.rotate(
      oldrefreshToken,
      meta,
    );
    const { accessToken } = await this.signAccessToken(record.userId);
    return { refreshToken, accessToken };
  }
}
