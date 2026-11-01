import { randomInt } from 'node:crypto';
import type { DiceRoll } from '@dice-arena/shared';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DiceService {
  /**
   * Two independent faces in the closed range 1 through 6.
   * `randomInt` excludes its upper bound, so `(1, 7)` is that range.
   * Inject this service and replace it in tests that need a scripted roll.
   */
  rollPair(): DiceRoll {
    return [randomInt(1, 7), randomInt(1, 7)];
  }
}
