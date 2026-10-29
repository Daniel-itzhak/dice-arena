import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../constants';
import { EntityIdSchema } from './common';

export const UsernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(USERNAME_PATTERN, 'Username may only contain letters and numbers');

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const AuthCredentialsSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});
export type AuthCredentialsDto = z.infer<typeof AuthCredentialsSchema>;

export const UserSchema = z.object({
  id: EntityIdSchema,
  username: z.string(),
  wins: z.int().nonnegative(),
  isAi: z.boolean(),
});
export type UserDto = z.infer<typeof UserSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: UserSchema,
});
export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
