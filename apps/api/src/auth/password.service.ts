import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** PHC-string prefix shared by every argon2 variant. */
const ARGON2_HASH_PREFIX = '$argon2';

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  /**
   * Resolves to `false` for stored values that are not argon2 hashes, such as the AI player's
   * placeholder, instead of letting argon2 throw and turn a failed login into a server error.
   */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    if (!passwordHash.startsWith(ARGON2_HASH_PREFIX)) {
      return false;
    }
    return verify(passwordHash, password);
  }
}
