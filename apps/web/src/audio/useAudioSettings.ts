import { useSyncExternalStore } from 'react';
import { getAudioSettings, subscribeToAudioSettings, type AudioSettings } from './soundEngine';

/** The current mute and music preferences, re-rendering whenever the sound engine changes them. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeToAudioSettings, getAudioSettings, getAudioSettings);
}
