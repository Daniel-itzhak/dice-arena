import type { OpponentSlot, PlayerSlot } from '../../store/useArenaStore';

export function isSignedIn({ user, token }: PlayerSlot): boolean {
  return user !== null && token !== null;
}

/** A human opponent needs a token; the AI never has one because its turns are played through `ai-step`. */
export function isOpponentReady(slot: OpponentSlot): boolean {
  return slot.isAiMode ? slot.user?.isAi === true : isSignedIn(slot);
}
