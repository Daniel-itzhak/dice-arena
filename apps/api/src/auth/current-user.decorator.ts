import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user.js';

/** Injects the user authenticated by JwtAuthGuard. Fails loudly if the route is not guarded. */
export const CurrentUser = createParamDecorator<undefined, AuthenticatedUser>(
  (_data, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new Error('@CurrentUser() was used on a route that is not guarded by JwtAuthGuard');
    }
    return user;
  },
);
