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

  login(authDto: { username: string; password: string }) {
    const { username, password } = authDto;
    if (password) {
      return {
        id: '1',
        username: username,
        accessToken: 'exampleAccessToken',
        refreshToken: 'exampleRefreshToken',
      };
    }
    return {
      id: '1',
      username: username,
      accessToken: 'exampleAccessToken',
      refreshToken: 'exampleRefreshToken',
    };
  }
}
