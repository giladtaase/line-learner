import { describe, it, expect } from 'vitest';
import { applySceneMerge, planSceneMerge, sceneKey } from './sceneMerge';
import { AppError } from './errors';
import type { ScriptEntry } from '../types';

let nextId = 0;
const scene = (text: string): ScriptEntry => ({ id: `s${nextId++}`, order: 0, type: 'scene', text });
const line = (character: string, text: string): ScriptEntry => ({
  id: `l${nextId++}`,
  order: 0,
  type: 'line',
  character,
  characters: [character],
  text
});

/** Scene headings plus one line each, e.g. play('9', '10', "10א'") */
function play(...numbers: string[]): ScriptEntry[] {
  return numbers.flatMap((n) => [scene(`תמונה ${n}`), line('נעמה', `old ${n}`)]);
}
function updated(...numbers: string[]): ScriptEntry[] {
  return numbers.flatMap((n) => [scene(`תמונה ${n}`), line('נעמה', `new ${n}`)]);
}
const texts = (entries: ScriptEntry[]) => entries.filter((e) => e.type === 'line').map((e) => e.text);

describe('sceneKey', () => {
  it.each([
    ['תמונה 9 חזרה למסיבה', [9, '']],
    ["תמונה 10א' ההזיה", [10, 'א']],
    ["תמונה 11 א'", [11, 'א']],
    ['תמונה 4      פלאש בק - בבית הילדים', [4, '']],
    ['Scene 3: The garden', [3, '']],
    ['SCENE 3b', [3, 'b']]
  ])('reads %s', (heading, key) => {
    expect(sceneKey(heading)).toEqual(key);
  });

  it('ignores headings without a number', () => {
    expect(sceneKey('חזרה להווה /למסיבה')).toBeNull();
    expect(sceneKey('מערכה שנייה')).toBeNull();
  });
});

describe('planSceneMerge / applySceneMerge', () => {
  it('replaces a single scene and keeps the rest untouched', () => {
    const existing = play('3', '4', '5');
    const plan = planSceneMerge(existing, updated('4'));
    expect(texts(applySceneMerge(existing, plan))).toEqual(['old 3', 'new 4', 'old 5']);
    // Untouched entries keep their ids (attempts are stored against them).
    expect(applySceneMerge(existing, plan)[0].id).toBe(existing[0].id);
  });

  it('replaces a run as a block, slotting in scenes the update adds', () => {
    const existing = play('8', '9', '10', "10א'", '11', '12', '13');
    const plan = planSceneMerge(existing, updated('9', '10', "10א'", '11', "11א'", '12'));
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].removed).toEqual(['תמונה 9', 'תמונה 10', "תמונה 10א'", 'תמונה 11', 'תמונה 12']);
    expect(texts(applySceneMerge(existing, plan))).toEqual([
      'old 8',
      'new 9',
      'new 10',
      "new 10א'",
      'new 11',
      "new 11א'",
      'new 12',
      'old 13'
    ]);
  });

  it('keeps separate stretches apart instead of deleting the scenes between them', () => {
    const existing = play('3', '4', '5', '6', '7');
    const plan = planSceneMerge(existing, updated('4', '6'));
    expect(plan.runs).toHaveLength(2);
    expect(texts(applySceneMerge(existing, plan))).toEqual(['old 3', 'new 4', 'old 5', 'new 6', 'old 7']);
  });

  it('inserts a brand-new scene in order', () => {
    const existing = play('11', '12');
    const plan = planSceneMerge(existing, updated("11א'"));
    expect(plan.runs[0].removed).toEqual([]);
    expect(texts(applySceneMerge(existing, plan))).toEqual(['old 11', "new 11א'", 'old 12']);
  });

  it('appends scenes past the end of the script', () => {
    const existing = play('1', '2');
    expect(texts(applySceneMerge(existing, planSceneMerge(existing, updated('3'))))).toEqual([
      'old 1',
      'old 2',
      'new 3'
    ]);
  });

  it('carries unnumbered headings inside an updated scene along with it', () => {
    const existing = play('1', '2');
    const update = [scene('תמונה 1'), line('נעמה', 'new 1'), scene('חזרה להווה'), line('נעמה', 'still 1')];
    expect(texts(applySceneMerge(existing, planSceneMerge(existing, update)))).toEqual([
      'new 1',
      'still 1',
      'old 2'
    ]);
  });

  it('drops front matter before the first scene and flags new characters', () => {
    const existing = play('1');
    const update = [line('מאת', 'title page'), scene('תמונה 1'), line('נתי', 'hi')];
    const plan = planSceneMerge(existing, update);
    expect(texts(plan.runs[0].entries)).toEqual(['hi']);
    expect(plan.newCharacters).toEqual(['נתי']);
  });

  it('rejects a file without numbered scenes', () => {
    expect(() => planSceneMerge(play('1'), [line('נעמה', 'x')])).toThrow(AppError);
  });
});
