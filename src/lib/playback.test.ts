import { describe, it, expect } from 'vitest';
import { runPlayback } from './playback';
import type { ScriptEntry } from '../types';

function line(id: string, character: string): ScriptEntry {
  return { id, order: 0, type: 'line', character, characters: [character], text: id };
}

const entries: ScriptEntry[] = [
  line('a1', 'A'),
  line('b1', 'B'),
  line('me1', 'ME'),
  line('a2', 'A'),
  line('me2', 'ME')
];
const isMine = (e: ScriptEntry) => e.character === 'ME';

describe('runPlayback', () => {
  it('performs other lines and pauses on my first line', async () => {
    const performed: string[] = [];
    const indices: number[] = [];
    const outcome = await runPlayback({
      entries,
      startIndex: 0,
      isMine,
      perform: async (e) => {
        performed.push(e.id);
      },
      onIndex: (i) => indices.push(i),
      isCancelled: () => false
    });
    expect(outcome).toBe('my-line');
    expect(performed).toEqual(['a1', 'b1']);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('continues past my line when started on the entry after it', async () => {
    const performed: string[] = [];
    const indices: number[] = [];
    const outcome = await runPlayback({
      entries,
      startIndex: 3,
      isMine,
      perform: async (e) => {
        performed.push(e.id);
      },
      onIndex: (i) => indices.push(i),
      isCancelled: () => false
    });
    expect(outcome).toBe('my-line');
    expect(performed).toEqual(['a2']);
    expect(indices).toEqual([3, 4]);
  });

  it('reports finished when it reaches the end', async () => {
    const outcome = await runPlayback({
      entries: entries.slice(0, 2),
      startIndex: 0,
      isMine,
      perform: async () => {},
      onIndex: () => {},
      isCancelled: () => false
    });
    expect(outcome).toBe('finished');
  });

  it('stops without moving the index once cancelled mid-entry', async () => {
    let cancelled = false;
    const indices: number[] = [];
    const outcome = await runPlayback({
      entries,
      startIndex: 0,
      isMine,
      perform: async () => {
        // Simulates pause/a newer run taking over while this line is speaking.
        cancelled = true;
      },
      onIndex: (i) => indices.push(i),
      isCancelled: () => cancelled
    });
    expect(outcome).toBe('cancelled');
    expect(indices).toEqual([0]);
  });
});
