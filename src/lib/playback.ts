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
 * The cue for the user's next line after `from`: the last line someone else
 * speaks before it, or (if only directions precede it) the entry right before
 * it. Skips a next line whose cue would be `from` itself, so repeated use
 * keeps moving forward. Undefined when there's no later cue.
 */
export function nextCueIndex(
  entries: ScriptEntry[],
  from: number,
  isMine: (entry: ScriptEntry) => boolean
): number | undefined {
  for (let mine = from + 1; mine < entries.length; mine++) {
    if (!isMine(entries[mine])) continue;
    // Nothing between `from` and the first line of mine is mine, so any line here is a cue.
    for (let k = mine - 1; k > from; k--) {
      if (entries[k].type === 'line') return k;
    }
    if (mine - 1 > from) return mine - 1;
  }
  return undefined;
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
