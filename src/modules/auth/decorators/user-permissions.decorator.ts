import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUserPermissions = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!request._permissions) {
      throw new Error(
        'GetUserData can be used only after the NeededPermissions',
      );
    }
    return request._permissions;
  },
);
