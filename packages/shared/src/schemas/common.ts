import { z } from 'zod';

/** Opaque database identifier for users and games. */
export const EntityIdSchema = z.string().min(1);
export type EntityId = z.infer<typeof EntityIdSchema>;
