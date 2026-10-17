import { useCallback, useEffect, useRef, useState } from 'react';
import { runPlayback } from '../lib/playback';
import { speak, stopSpeaking } from '../lib/tts';
import { stripInlineDirections } from '../lib/fuzzyMatch';
import type { Language, OtherLinesMode, ScriptEntry } from '../types';

// How long playback lingers on an entry that isn't spoken aloud.
const PAUSE_MS: Record<ScriptEntry['type'], number> = {
  direction: 700,
  scene: 1000,
  line: 1400
};

export interface PlaybackOptions {
  entries: ScriptEntry[];
  language: Language;
  isMine: (entry: ScriptEntry) => boolean;
  otherLinesMode: OtherLinesMode;
  ttsRate: number;
}

export interface Playback {
  index: number;
  playing: boolean;
  /** Plays from the current entry. */
  play: () => void;
  pause: () => void;
  /** Stops and returns to the first entry. */
  stop: () => void;
  /** Resumes playback after the user has said their line. */
  continueAfterMyLine: () => void;
  /** Stops playback and moves to an entry (clamped to the script). */
  jumpTo: (index: number) => void;
}

/**
 * Read-through playback state. Every start, pause, stop or jump bumps a run
 * id; a run that sees a newer id stops without touching the index, so an old
 * run can never keep playing alongside a new one.
 */
export function usePlayback({
  entries,
  language,
  isMine,
  otherLinesMode,
  ttsRate
}: PlaybackOptions): Playback {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const runId = useRef(0);

  const halt = useCallback(() => {
    runId.current++;
    stopSpeaking();
    setPlaying(false);
  }, []);

  // Stop speaking when the player goes away.
  useEffect(() => halt, [halt]);

  const runFrom = useCallback(
    async (startIndex: number) => {
      stopSpeaking();
      const myRun = ++runId.current;
      const isCancelled = () => runId.current !== myRun;
      setPlaying(true);
      await runPlayback({
        entries,
        startIndex,
        isMine,
        onIndex: setIndex,
        isCancelled,
        perform: async (entry) => {
          if (entry.type === 'line' && otherLinesMode === 'speak') {
            await speak(stripInlineDirections(entry.text), language, ttsRate);
          } else {
            await new Promise((r) => setTimeout(r, PAUSE_MS[entry.type]));
          }
        }
      });
      // A cancelled run leaves `playing` to whoever cancelled it.
      if (!isCancelled()) setPlaying(false);
    },
    [entries, isMine, otherLinesMode, language, ttsRate]
  );

  const jumpTo = useCallback(
    (target: number) => {
      halt();
      setIndex(Math.max(0, Math.min(target, entries.length - 1)));
    },
    [halt, entries.length]
  );

  return {
    index,
    playing,
    play: () => void runFrom(index),
    pause: halt,
    stop: () => jumpTo(0),
    continueAfterMyLine: () => {
      // `index` still points at the user's own line; restarting there would pause at once.
      if (index < entries.length - 1) void runFrom(index + 1);
    },
    jumpTo
  };
}
