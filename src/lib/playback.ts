import type { ScriptEntry } from '../types';

export type PlaybackOutcome = 'my-line' | 'finished' | 'cancelled';

export interface PlaybackOptions {
  entries: ScriptEntry[];
  startIndex: number;
  /** Whether an entry is one of the user's own lines, where playback pauses. */
  isMine: (entry: ScriptEntry) => boolean;
  /** Performs one entry that isn't the user's (speaks it, or waits long
   *  enough to read it). Resolves when done, including after being cut short. */
  perform: (entry: ScriptEntry) => Promise<void>;
  /** Called each time playback moves onto a new entry. */
  onIndex: (index: number) => void;
  /** Checked before and after every entry. Once it returns true, playback
   *  stops without touching the index again, so a newer run (or a manual
   *  jump) that superseded this one stays in control. */
  isCancelled: () => boolean;
}

/**
 * Auto-plays a script from `startIndex`, performing other characters' lines
 * until it reaches one of the user's own lines (pauses there), the end of the
 * script, or cancellation.
 */
export async function runPlayback(options: PlaybackOptions): Promise<PlaybackOutcome> {
  const { entries, startIndex, isMine, perform, onIndex, isCancelled } = options;
  for (let i = startIndex; i < entries.length; i++) {
    if (isCancelled()) return 'cancelled';
    const entry = entries[i];
    onIndex(i);
    if (isMine(entry)) return 'my-line';
    await perform(entry);
    if (isCancelled()) return 'cancelled';
  }
  return 'finished';
}
