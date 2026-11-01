import { minutes, Throttle } from '@nestjs/throttler';

/** Applied to every route by the global ThrottlerGuard; counted per client IP. */
export const DEFAULT_RATE_LIMIT = { ttl: minutes(1), limit: 60 };

/** Stricter budget for credential endpoints (login, register) to slow down brute-force attempts. */
export const AUTH_RATE_LIMIT = { ttl: minutes(1), limit: 10 };

export const AuthThrottle = (): MethodDecorator & ClassDecorator => Throttle({ default: AUTH_RATE_LIMIT });
