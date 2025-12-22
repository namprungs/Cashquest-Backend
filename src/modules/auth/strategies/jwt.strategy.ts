import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenPayload } from '../interfaces/token.interface';
import { UserService } from 'src/modules/user/user.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request.cookies.Authentication,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: configService.getOrThrow('JWT_ACCESS_TOKEN_SECRET'),
    });
  }
  validate(tokenpayload: TokenPayload) {
    return this.userService.getUserWithRolePermissionById(tokenpayload.userId);
  }
}
