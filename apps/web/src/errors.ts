import { z } from 'zod';

export interface ApiIssue {
  /** Dot-separated path to the offending field; empty when the whole payload is invalid. */
  path: string;
  message: string;
}

/** Error body shape produced by NestJS HTTP exceptions and the API's Zod validation pipe. */
const ApiErrorBodySchema = z.object({
  message: z.union([z.string(), z.array(z.string())]),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

/** The API answered with a non-2xx status; `message` is the server's own explanation. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly ApiIssue[] = [],
  ) {
    super(message);
  }

  static fromResponse(status: number, body: unknown): ApiError {
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (!parsed.success) {
      return new ApiError(status, `Request failed with status ${status}`);
    }
    const { message, issues = [] } = parsed.data;
    return new ApiError(status, Array.isArray(message) ? message.join('; ') : message, issues);
  }
}

/** The request never produced an HTTP response (offline, DNS failure, CORS rejection). */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor(cause: unknown) {
    super('Could not reach the Dice Arena server', { cause });
  }
}

/** The API answered 2xx with a body that does not match the shared `@dice-arena/shared` contract. */
export class ContractError extends Error {
  override readonly name = 'ContractError';

  constructor(endpoint: string, cause: z.ZodError) {
    super(`Unexpected response from ${endpoint}`, { cause });
  }
}

/** The local sessions cannot support the requested action, so nothing was sent to the API. */
export class SessionError extends Error {
  override readonly name = 'SessionError';
}

const TOO_MANY_REQUESTS = 429;

/** A sentence to show the user for anything the API client or the store throws. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === TOO_MANY_REQUESTS) {
      return 'Too many attempts. Wait a minute and try again.';
    }
    return error.issues.length > 0 ? error.issues.map((issue) => issue.message).join('. ') : error.message;
  }
  if (error instanceof NetworkError || error instanceof ContractError || error instanceof SessionError) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
