import type { ScriptEntry } from '../types';

/** Indices of the scene-heading entries, in script order. */
export function sceneStarts(entries: ScriptEntry[]): number[] {
  return entries.flatMap((e, i) => (e.type === 'scene' ? [i] : []));
}

/** 1-based number of the scene containing `index`, or 0 before the first scene. */
export function sceneNumberAt(starts: number[], index: number): number {
  return starts.filter((s) => s <= index).length;
}

/** Start of the closest scene before `index`, or undefined if there is none. */
export function previousSceneStart(starts: number[], index: number): number | undefined {
  const earlier = starts.filter((s) => s < index);
  return earlier[earlier.length - 1];
}

/** Start of the next scene after `index`, or undefined if there is none. */
export function nextSceneStart(starts: number[], index: number): number | undefined {
  return starts.find((s) => s > index);
}

/** Entry index range [start, end) of the scene at position `sceneIdx` in `starts`. */
export function sceneRange(
  starts: number[],
  sceneIdx: number,
  totalEntries: number
): { start: number; end: number } {
  return { start: starts[sceneIdx], end: starts[sceneIdx + 1] ?? totalEntries };
}
