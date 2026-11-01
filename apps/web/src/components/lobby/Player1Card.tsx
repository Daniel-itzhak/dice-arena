import { useArenaStore } from '../../store/useArenaStore';
import { SLOT_THEMES } from '../slotTheme';
import { SECONDARY_BUTTON } from '../ui/buttonStyles';
import { AuthForm } from './AuthForm';
import { PlayerBadge } from './PlayerBadge';
import { PlayerCard } from './PlayerCard';
import { isSignedIn } from './readiness';

const theme = SLOT_THEMES.slot1;

export function Player1Card() {
  const slot1 = useArenaStore((state) => state.slot1);
  const slot2 = useArenaStore((state) => state.slot2);
  const clearSession = useArenaStore((state) => state.clearSession);
  const opponent =
    slot2.user !== null && !slot2.isAiMode ? { username: slot2.user.username, label: SLOT_THEMES.slot2.label } : null;

  return (
    <PlayerCard theme={theme} ready={isSignedIn(slot1)}>
      {slot1.user === null ? (
        <AuthForm slot="slot1" playerLabel={theme.label} otherPlayer={opponent} />
      ) : (
        <PlayerBadge user={slot1.user} theme={theme} description="Moves first">
          <button type="button" onClick={() => clearSession('slot1')} className={`${SECONDARY_BUTTON} mt-auto`}>
            Switch Account
          </button>
        </PlayerBadge>
      )}
    </PlayerCard>
  );
}
