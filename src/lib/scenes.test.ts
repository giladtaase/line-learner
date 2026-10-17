import { describe, it, expect } from 'vitest';
import {
  sceneStarts,
  sceneNumberAt,
  previousSceneStart,
  nextSceneStart,
  sceneRange
} from './scenes';
import type { ScriptEntry } from '../types';

function entry(type: ScriptEntry['type']): ScriptEntry {
  return { id: Math.random().toString(), order: 0, type, text: type };
}

// 0 direction, 1 scene, 2 line, 3 line, 4 scene, 5 line
const entries = [
  entry('direction'),
  entry('scene'),
  entry('line'),
  entry('line'),
  entry('scene'),
  entry('line')
];
const starts = sceneStarts(entries);

describe('scenes', () => {
  it('finds scene headings', () => {
    expect(starts).toEqual([1, 4]);
  });

  it('numbers the scene containing an index, 0 before the first', () => {
    expect(sceneNumberAt(starts, 0)).toBe(0);
    expect(sceneNumberAt(starts, 1)).toBe(1);
    expect(sceneNumberAt(starts, 3)).toBe(1);
    expect(sceneNumberAt(starts, 5)).toBe(2);
  });

  it('finds the previous and next scene starts', () => {
    expect(previousSceneStart(starts, 1)).toBeUndefined();
    expect(previousSceneStart(starts, 3)).toBe(1);
    expect(previousSceneStart(starts, 5)).toBe(4);
    expect(nextSceneStart(starts, 0)).toBe(1);
    expect(nextSceneStart(starts, 3)).toBe(4);
    expect(nextSceneStart(starts, 4)).toBeUndefined();
  });

  it('gives each scene its entry range', () => {
    expect(sceneRange(starts, 0, entries.length)).toEqual({ start: 1, end: 4 });
    expect(sceneRange(starts, 1, entries.length)).toEqual({ start: 4, end: 6 });
  });
});
