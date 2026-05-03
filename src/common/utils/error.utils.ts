import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function isUniqueConstraintError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);
  return message.includes('unique constraint');
}

export function rethrowKnownOrWrap(error: unknown, wrapMessage: string): never {
  if (
    error instanceof BadRequestException ||
    error instanceof NotFoundException ||
    error instanceof ForbiddenException
  ) {
    throw error;
  }
  if (isUniqueConstraintError(error)) {
    throw new BadRequestException('State conflict: please refresh and try again');
  }
  throw new BadRequestException(wrapMessage);
}
