import { useEffect } from 'react';
import { armOnFirstGesture, isAudioSupported, toggleAmbientMusic } from '../../audio/soundEngine';
import { useAudioSettings } from '../../audio/useAudioSettings';
import { SECONDARY_BUTTON } from '../ui/buttonStyles';

const UNSUPPORTED_HINT = 'This browser does not support the Web Audio API';

const TOGGLE_BUTTON = `${SECONDARY_BUTTON} min-w-28`;
const MUSIC_ON = `${TOGGLE_BUTTON} border-amber-400/80 bg-amber-400/15 text-amber-100`;

/** Navigation-bar toggle for the ambient loop. Dice cues still play either way. */
export function AudioControls() {
  const { musicEnabled } = useAudioSettings();
  const supported = isAudioSupported();

  // After a reload, a previously enabled loop may only start once the user interacts with the page.
  useEffect(() => armOnFirstGesture(), []);

  return (
    <button
      type="button"
      lang="en"
      translate="no"
      data-audio-control=""
      aria-pressed={musicEnabled}
      disabled={!supported}
      title={supported ? (musicEnabled ? 'Turn ambient music off' : 'Turn ambient music on') : UNSUPPORTED_HINT}
      onClick={toggleAmbientMusic}
      className={musicEnabled ? MUSIC_ON : TOGGLE_BUTTON}
    >
      <MusicIcon off={!musicEnabled} />
      {musicEnabled ? 'Music on' : 'Music off'}
    </button>
  );
}

function MusicIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
      {off && <path strokeLinecap="round" d="M3 3l18 18" />}
    </svg>
  );
}
