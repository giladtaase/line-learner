import { describe, it, expect } from 'vitest';
import {
  parseScript,
  resolveCueCharacters,
  recomputeEntryCharacters,
  getMyCharacters
} from './scriptParser';
import type { ScriptEntry } from '../types';

function simplify(entries: ScriptEntry[]) {
  return entries.map(({ type, character, characters, text }) => ({
    type,
    character,
    characters,
    text
  }));
}

describe('parseScript – basic cues', () => {
  it('parses "NAME: text" cues on the same line', () => {
    const result = parseScript('ROMEO: Hello there.\nJULIET: Hi.');
    expect(simplify(result.entries)).toEqual([
      { type: 'line', character: 'ROMEO', characters: ['ROMEO'], text: 'Hello there.' },
      { type: 'line', character: 'JULIET', characters: ['JULIET'], text: 'Hi.' }
    ]);
    expect(result.characters).toEqual(['JULIET', 'ROMEO']);
    expect(result.language).toBe('en');
  });

  it('parses "NAME." cues', () => {
    const result = parseScript('HAMLET. To be or not to be');
    expect(result.entries[0]).toMatchObject({
      type: 'line',
      character: 'HAMLET',
      text: 'To be or not to be'
    });
  });

  it('attaches following lines to a standalone cue line', () => {
    const result = parseScript('ROMEO:\nBut soft, what light\nthrough yonder window breaks');
    expect(simplify(result.entries)).toEqual([
      { type: 'line', character: 'ROMEO', characters: ['ROMEO'], text: 'But soft, what light' },
      {
        type: 'line',
        character: 'ROMEO',
        characters: ['ROMEO'],
        text: 'through yonder window breaks'
      }
    ]);
  });

  it('accepts names with numbers (e.g. GUARD 1)', () => {
    const result = parseScript('GUARD 1: Halt!');
    expect(result.entries[0]).toMatchObject({ character: 'GUARD 1', text: 'Halt!' });
  });

  it('does not treat mixed-case English prefixes as cues', () => {
    const result = parseScript('Note: this is not a cue');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe('direction');
  });

  it('ignores blank lines and handles CRLF line endings', () => {
    const result = parseScript('ROMEO: One\r\n\r\n\r\nJULIET: Two\r\n');
    expect(result.entries.map((e) => e.text)).toEqual(['One', 'Two']);
  });

  it('assigns sequential order values and unique ids', () => {
    const result = parseScript('(Enter)\nROMEO: One\nJULIET: Two');
    expect(result.entries.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(new Set(result.entries.map((e) => e.id)).size).toBe(3);
  });

  it('returns no entries for empty input', () => {
    const result = parseScript('');
    expect(result.entries).toEqual([]);
    expect(result.characters).toEqual([]);
  });
});

describe('parseScript – stage directions', () => {
  it('parses parenthesized lines as directions, without the wrappers', () => {
    const result = parseScript('(Enter Romeo)\nROMEO: Hello');
    expect(result.entries[0]).toMatchObject({ type: 'direction', text: 'Enter Romeo' });
  });

  it('parses bracketed lines as directions', () => {
    const result = parseScript('[Lights fade]');
    expect(result.entries[0]).toMatchObject({ type: 'direction', text: 'Lights fade' });
  });

  it('ends a multi-line speech at a direction', () => {
    const result = parseScript('ROMEO:\nFirst line\n(He sits)\nNot dialogue anymore');
    expect(result.entries.map((e) => e.type)).toEqual(['line', 'direction', 'direction']);
  });

  it('keeps inline directions as part of the line text', () => {
    const result = parseScript('ROMEO: (softly) Hello');
    expect(result.entries[0]).toMatchObject({ type: 'line', text: '(softly) Hello' });
  });
});

describe('parseScript – scene headings', () => {
  it.each(['SCENE 1', 'Scene 3: The garden', 'ACT TWO', 'Act IV', 'תמונה 1', "תמונה א'", 'מערכה שנייה'])(
    'recognizes "%s" as a scene heading',
    (heading) => {
      const result = parseScript(`${heading}\nROMEO: Hello`);
      expect(result.entries[0]).toMatchObject({ type: 'scene', text: heading });
      expect(result.entries[1]).toMatchObject({ type: 'line', character: 'ROMEO' });
    }
  );

  it('ends a multi-line speech at a scene heading', () => {
    const result = parseScript('ROMEO:\nGoodbye\nSCENE 2\nAfterwards');
    expect(result.entries.map((e) => e.type)).toEqual(['line', 'scene', 'direction']);
  });

  it('does not treat long lines starting with "scene" as headings', () => {
    const long = 'Scene ' + 'x'.repeat(80);
    const result = parseScript(long);
    expect(result.entries[0].type).toBe('direction');
  });

  it('does not treat words that merely start with "act"/"scene" as headings', () => {
    const result = parseScript('ACTOR: Hello there.\nROMEO:\nActually, I disagree.\nScenery is nice.');
    expect(simplify(result.entries)).toEqual([
      { type: 'line', character: 'ACTOR', characters: ['ACTOR'], text: 'Hello there.' },
      { type: 'line', character: 'ROMEO', characters: ['ROMEO'], text: 'Actually, I disagree.' },
      { type: 'line', character: 'ROMEO', characters: ['ROMEO'], text: 'Scenery is nice.' }
    ]);
  });
});

describe('parseScript – Hebrew', () => {
  it('detects Hebrew and parses Hebrew cues', () => {
    const result = parseScript('רומיאו: שלום לך\nיוליה: היי');
    expect(result.language).toBe('he');
    expect(simplify(result.entries)).toEqual([
      { type: 'line', character: 'רומיאו', characters: ['רומיאו'], text: 'שלום לך' },
      { type: 'line', character: 'יוליה', characters: ['יוליה'], text: 'היי' }
    ]);
    expect(result.characters).toEqual(['יוליה', 'רומיאו']);
  });

  it('detects language by majority script', () => {
    expect(parseScript('ROMEO: hello there my friend\nיוליה: היי').language).toBe('en');
  });
});

describe('parseScript – joint cues', () => {
  it('splits an English joint cue when every part is a standalone character', () => {
    const result = parseScript('ALON: hi\nOREN: yo\nALON and OREN: together');
    expect(result.entries[2]).toMatchObject({
      character: 'ALON and OREN',
      characters: ['ALON', 'OREN']
    });
    expect(result.characters).toEqual(['ALON', 'OREN']);
  });

  it('splits comma and ampersand separated cues', () => {
    const result = parseScript('A: 1\nB: 2\nC: 3\nA, B & C: all');
    expect(result.entries[3].characters).toEqual(['A', 'B', 'C']);
  });

  it('keeps a joint cue whole when a part never speaks alone', () => {
    const result = parseScript('ALON: hi\nALON and OREN: together');
    expect(result.entries[1].characters).toEqual(['ALON and OREN']);
    expect(result.characters).toEqual(['ALON', 'ALON and OREN']);
  });

  it('splits a Hebrew vav-joined cue', () => {
    const result = parseScript('אלון: היי\nאורן: יו\nאלון ואורן: ביחד');
    expect(result.entries[2].characters).toEqual(['אלון', 'אורן']);
  });

  it('splits Hebrew cues with commas and vav', () => {
    const result = parseScript('אלון: 1\nאורן: 2\nדנה: 3\nאלון, אורן ודנה: ביחד');
    expect(result.entries[3].characters).toEqual(['אלון', 'אורן', 'דנה']);
  });

  it('does not split names that contain a vav mid-word', () => {
    const result = parseScript('דוד: שלום\nרוני: היי');
    expect(result.characters.sort()).toEqual(['דוד', 'רוני'].sort());
  });
});

describe('resolveCueCharacters', () => {
  const names = new Set(['ALON', 'OREN', 'אלון', 'אורן']);

  it('returns a single trimmed name for a simple cue', () => {
    expect(resolveCueCharacters('  ALON ', names)).toEqual(['ALON']);
  });

  it('splits only when all parts are confirmed', () => {
    expect(resolveCueCharacters('ALON and OREN', names)).toEqual(['ALON', 'OREN']);
    expect(resolveCueCharacters('ALON and DANA', names)).toEqual(['ALON and DANA']);
  });

  it('splits "and" case-insensitively', () => {
    expect(resolveCueCharacters('ALON AND OREN', names)).toEqual(['ALON', 'OREN']);
  });

  it('does not split "and" inside a word', () => {
    expect(resolveCueCharacters('ALEXANDER', new Set(['ALEX', 'ER']))).toEqual(['ALEXANDER']);
  });

  it('splits a Hebrew vav-joined cue', () => {
    expect(resolveCueCharacters('אלון ואורן', names)).toEqual(['אלון', 'אורן']);
  });
});

describe('recomputeEntryCharacters', () => {
  function line(character: string, text = 'x'): ScriptEntry {
    return { id: character + text, order: 0, type: 'line', character, text };
  }

  it('re-derives characters after an edit makes a joint cue splittable', () => {
    const entries: ScriptEntry[] = [
      line('ALON'),
      line('OREN'),
      line('ALON and OREN'),
      { id: 'd', order: 3, type: 'direction', text: 'exit' }
    ];
    const result = recomputeEntryCharacters(entries);
    expect(result.entries[2].characters).toEqual(['ALON', 'OREN']);
    expect(result.characters).toEqual(['ALON', 'OREN']);
    expect(result.entries[3]).toBe(entries[3]); // non-lines untouched
  });

  it('un-splits a joint cue when a part no longer speaks alone', () => {
    const result = recomputeEntryCharacters([line('ALON'), line('ALON and OREN')]);
    expect(result.entries[1].characters).toEqual(['ALON and OREN']);
    expect(result.characters).toEqual(['ALON', 'ALON and OREN']);
  });

  it('drops characters that no longer have any lines', () => {
    const result = recomputeEntryCharacters([line('ROMEO')]);
    expect(result.characters).toEqual(['ROMEO']);
  });

  it('skips lines without a character', () => {
    const entries: ScriptEntry[] = [{ id: '1', order: 0, type: 'line', character: '', text: 'x' }];
    const result = recomputeEntryCharacters(entries);
    expect(result.characters).toEqual([]);
    expect(result.entries[0]).toBe(entries[0]);
  });

  it('does not mutate the input entries', () => {
    const entries = [line('ALON')];
    recomputeEntryCharacters(entries);
    expect(entries[0].characters).toBeUndefined();
  });
});

describe('getMyCharacters', () => {
  it('returns myCharacters when set', () => {
    expect(getMyCharacters({ myCharacters: ['A', 'B'], myCharacter: 'C' })).toEqual(['A', 'B']);
  });

  it('migrates the legacy single myCharacter field', () => {
    expect(getMyCharacters({ myCharacter: 'ROMEO' })).toEqual(['ROMEO']);
  });

  it('falls back to the legacy field when myCharacters is empty', () => {
    expect(getMyCharacters({ myCharacters: [], myCharacter: 'ROMEO' })).toEqual(['ROMEO']);
  });

  it('returns an empty list when nothing is set', () => {
    expect(getMyCharacters({})).toEqual([]);
  });
});
