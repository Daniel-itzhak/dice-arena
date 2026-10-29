import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('produces salted argon2id hashes that verify only the original password', async () => {
    const first = await passwords.hash('correct-horse');
    const second = await passwords.hash('correct-horse');

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    await expect(passwords.verify(first, 'correct-horse')).resolves.toBe(true);
    await expect(passwords.verify(first, 'wrong-horse')).resolves.toBe(false);
  });

  it.each(['!', '', 'plaintext-password', '$2b$10$bcryptLookingValue'])(
    'rejects any password against the non-argon2 stored value %j',
    async (stored) => {
      await expect(passwords.verify(stored, stored)).resolves.toBe(false);
    },
  );
});
