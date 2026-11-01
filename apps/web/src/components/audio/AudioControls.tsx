import { useEffect } from 'react';
import { armOnFirstGesture, isAudioSupported, toggleAmbientMusic, toggleMute } from '../../audio/soundEngine';
import { useAudioSettings } from '../../audio/useAudioSettings';
import { SECONDARY_BUTTON } from '../ui/buttonStyles';

const UNSUPPORTED_HINT = 'This browser does not support the Web Audio API';

/** Navigation-bar toggles for the ambient music and the global mute. */
export function AudioControls() {
  const { muted, musicEnabled } = useAudioSettings();
  const supported = isAudioSupported();

  // After a reload the ambient loop may only start once the user interacts with the page.
  useEffect(() => armOnFirstGesture(), []);

  return (
    <div role="group" aria-label="Audio" className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={musicEnabled}
        disabled={!supported}
        title={supported ? (musicEnabled ? 'Turn ambient music off' : 'Turn ambient music on') : UNSUPPORTED_HINT}
        onClick={toggleAmbientMusic}
        className={SECONDARY_BUTTON}
      >
        <MusicIcon off={!musicEnabled} />
        <span className="sr-only sm:not-sr-only">Music</span>
      </button>
      <button
        type="button"
        disabled={!supported}
        title={supported ? (muted ? 'Unmute all sounds' : 'Mute all sounds') : UNSUPPORTED_HINT}
        onClick={toggleMute}
        className={SECONDARY_BUTTON}
      >
        <SpeakerIcon muted={muted} />
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </div>
  );
}

function MusicIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
      {off && <path strokeLinecap="round" d="M3 3l18 18" />}
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
      {muted ? (
        <path strokeLinecap="round" d="M23 9l-6 6M17 9l6 6" />
      ) : (
        <path strokeLinecap="round" d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
      )}
    </svg>
  );
}
