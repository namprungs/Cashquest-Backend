import {
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService } from './services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      ua: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'] as string | undefined,
    };
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const meta = this.extractMeta(request);
    const token = await this.authService.login(user, response, meta);
    return token;
  }

  @Post('refresh')
  async refresh(@Req() request: Request) {
    const raw = request.headers['x-refresh-key'];
    const refreshToken = Array.isArray(raw) ? raw[0] : raw;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const meta = this.extractMeta(request);

    return this.authService.refresh(refreshToken, meta);
  }

  @Post('logout')
  async logout(@Req() request: Request) {
    const raw = request.headers['x-refresh-key'];
    const refreshToken = Array.isArray(raw) ? raw[0] : raw;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    return this.authService.logout(refreshToken);
  }
}
