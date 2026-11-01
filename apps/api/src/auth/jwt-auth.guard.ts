import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { AccessTokenPayloadSchema, type AuthenticatedRequest } from './authenticated-user.js';

const BEARER_PATTERN = /^Bearer (\S+)$/i;

/**
 * Accepts requests carrying a valid `Authorization: Bearer <token>` header and attaches the token's
 * user to the request. Stateless, so one browser can hold tokens for two players at once.
 * Controllers using it must live in a module that imports AuthModule.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = AccessTokenPayloadSchema.safeParse(await this.verify(token));
    if (!payload.success) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = { id: payload.data.sub, username: payload.data.username };
    return true;
  }

  private async verify(token: string): Promise<object> {
    try {
      return await this.jwt.verifyAsync<object>(token);
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid or expired access token');
      }
      throw error;
    }
  }
}
