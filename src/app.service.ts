import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      id: 1,
      username: 'exampleUser',
      accessToken: 'exampleAccessToken',
      refreshToken: 'exampleRefreshToken',
    };
  }
}
