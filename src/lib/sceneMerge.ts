import { AppError } from './errors';
import type { ScriptEntry } from '../types';

/**
 * Merging a file with new versions of some scenes into an existing script.
 *
 * Scenes are matched by the number in their heading ("תמונה 10א'", "Scene 3").
 * Each run of consecutive updated scenes replaces the same stretch of the
 * script as a block, so a scene the update adds (11א' between 11 and 12)
 * lands in place, and a scene the update rewrites under the same number
 * replaces the old one. Scenes the update doesn't mention are never removed.
 */

/** A scene's position in the play: its number, then an optional letter suffix ("10א'" → [10, "א"]). */
export type SceneKey = [number, string];

// A suffix letter must stand alone ("10א'", "3b"), so a title word right
// after the number ("תמונה 9 חזרה למסיבה") isn't mistaken for one.
const SCENE_NUMBER =
  /^\s*(?:תמונה|scene)\s*(\d+)(?:\s*([א-תa-z])['׳]?(?![א-תa-z]))?/i;

export function sceneKey(heading: string): SceneKey | null {
  const match = heading.match(SCENE_NUMBER);
  return match ? [Number(match[1]), (match[2] ?? '').toLowerCase()] : null;
}

export function compareKeys(a: SceneKey, b: SceneKey): number {
  return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
}

const sameKey = (a: SceneKey, b: SceneKey) => compareKeys(a, b) === 0;

interface KeyedScene {
  key: SceneKey;
  index: number;
}

function keyedScenes(entries: ScriptEntry[]): KeyedScene[] {
  return entries.flatMap((e, index) => {
    const key = e.type === 'scene' ? sceneKey(e.text) : null;
    return key ? [{ key, index }] : [];
  });
}

export interface MergeRun {
  /** Entry range [start, end) of the existing script this run replaces (start === end: pure insertion). */
  start: number;
  end: number;
  /** Headings of the existing scenes being replaced. */
  removed: string[];
  /** Headings of the scenes coming in. */
  added: string[];
  /** The new entries for this stretch. */
  entries: ScriptEntry[];
}

export interface MergePlan {
  runs: MergeRun[];
  /** Characters in the update the script doesn't have yet, worth a check for misspelled names. */
  newCharacters: string[];
}

export function planSceneMerge(existing: ScriptEntry[], update: ScriptEntry[]): MergePlan {
  const incoming = keyedScenes(update);
  if (incoming.length === 0) {
    throw new AppError('mergeNoScenes', 'No numbered scene headings were found in this file.');
  }
  const current = keyedScenes(existing);

  // Split the update where the script has a scene between two updated ones
  // that the update leaves out: those are separate stretches (e.g. scenes 4 and 9).
  const runs: KeyedScene[][] = [];
  for (const scene of incoming) {
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    const skipsOver =
      previous &&
      current.some(
        (c) =>
          compareKeys(c.key, previous.key) > 0 &&
          compareKeys(c.key, scene.key) < 0 &&
          !incoming.some((i) => sameKey(i.key, c.key))
      );
    if (run && !skipsOver) run.push(scene);
    else runs.push([scene]);
  }

  const headingOf = (entries: ScriptEntry[], index: number) => entries[index].text;
  const plannedRuns = runs.map((run): MergeRun => {
    const first = run[0].key;
    const last = run[run.length - 1].key;
    const start = current.find((c) => compareKeys(c.key, first) >= 0)?.index ?? existing.length;
    const end = current.find((c) => compareKeys(c.key, last) > 0)?.index ?? existing.length;
    const nextIncoming = incoming[incoming.indexOf(run[run.length - 1]) + 1];
    const updateEnd = nextIncoming?.index ?? update.length;
    return {
      start,
      end: Math.max(start, end),
      removed: current.filter((c) => c.index >= start && c.index < end).map((c) => headingOf(existing, c.index)),
      added: run.map((s) => headingOf(update, s.index)),
      entries: update.slice(run[0].index, updateEnd)
    };
  });

  const known = new Set(existing.flatMap((e) => e.characters ?? []));
  const newCharacters = [
    ...new Set(plannedRuns.flatMap((r) => r.entries.flatMap((e) => e.characters ?? [])))
  ].filter((c) => !known.has(c));

  return { runs: plannedRuns, newCharacters };
}

/** The script with every run of the plan applied. Entries outside the runs are kept as they were. */
export function applySceneMerge(existing: ScriptEntry[], plan: MergePlan): ScriptEntry[] {
  const merged = [...existing];
  // Back to front, so earlier ranges keep their indices.
  for (const run of [...plan.runs].sort((a, b) => b.start - a.start)) {
    merged.splice(run.start, run.end - run.start, ...run.entries);
  }
  return merged.map((e, order) => ({ ...e, order }));
}
