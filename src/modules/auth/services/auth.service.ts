// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from 'src/modules/user/user.service';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { RefreshTokenService, TokenMeta } from './refresh-token.service';
import { TokenPayload } from '../interfaces/token.interface';

type LoginUser = {
  id: string;
  password: string;
  isActive: boolean;
};

@Injectable()
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly accessTokenExpirationMs: number;
  private readonly accessTokenExpiration: string;

  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
    this.accessTokenSecret =
      this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ?? '';
    this.accessTokenExpirationMs = Number(
      this.configService.get('JWT_ACCESS_TOKEN_EXPIRATION_MS') ?? 0,
    );
    this.accessTokenExpiration = `${this.accessTokenExpirationMs}ms`;
  }

  private signAccessToken(userId: string) {
    const expiresAccessToken = new Date(
      Date.now() + this.accessTokenExpirationMs,
    );

    const tokenPayload: TokenPayload = {
      userId,
    };

    const accessToken = this.jwtService.sign(tokenPayload, {
      secret: this.accessTokenSecret,
      expiresIn: this.accessTokenExpiration as JwtSignOptions['expiresIn'],
    });
    return { accessToken, expiresAccessToken };
  }

  async verifyUser(email: string, password: string) {
    try {
      const user = await this.userService.getUserForLogin(email);
      const authenticated = await bcrypt.compare(password, user.password);
      if (!authenticated || !user.isActive) {
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

  async login(user: LoginUser, response: Response, meta: TokenMeta) {
    try {
      const { accessToken, expiresAccessToken } = this.signAccessToken(user.id);
      const refreshToken = await this.refreshTokenService.issue(user.id, meta);
      response.cookie('Authentication', accessToken, {
        httpOnly: true,
        secure: true,
        expires: expiresAccessToken,
      });

      return { accessToken, refreshToken: refreshToken.refreshToken };
    } catch (e) {
      console.error(e.message);
      throw new BadRequestException('Login failed');
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
    const { accessToken } = this.signAccessToken(record.userId);
    return { refreshToken, accessToken };
  }
}
