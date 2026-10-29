import { EntityIdSchema } from '@dice-arena/shared';
import type { Request } from 'express';
import { z } from 'zod';

/** Claims signed into every access token. */
export const AccessTokenPayloadSchema = z.object({
  /** User id. */
  sub: EntityIdSchema,
  username: z.string().min(1),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

/** Identity that JwtAuthGuard attaches to the request and `@CurrentUser()` injects into handlers. */
export interface AuthenticatedUser {
  id: string;
  username: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
