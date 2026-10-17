import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SCRIPT_FILE_VERSION,
  scriptToFile,
  serializeScriptFile,
  parseScriptFile,
  scriptFileToNewScript,
  ScriptFileParseError,
  downloadScriptFile,
  canShareScriptFile,
  shareScriptFile
} from './scriptFile';
import type { Script } from '../types';

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    id: 'script-1',
    title: 'My Play',
    language: 'en',
    myCharacter: 'ROMEO',
    myCharacters: ['ROMEO', 'NURSE'],
    characters: ['JULIET', 'NURSE', 'ROMEO'],
    entries: [
      { id: 'e0', order: 0, type: 'scene', text: 'SCENE 1' },
      { id: 'e1', order: 1, type: 'direction', text: 'Enter Romeo' },
      {
        id: 'e2',
        order: 2,
        type: 'line',
        character: 'ROMEO',
        characters: ['ROMEO'],
        text: 'Hello'
      }
    ],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides
  };
}

function validFileJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...scriptToFile(makeScript()), ...overrides });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('scriptToFile / serializeScriptFile', () => {
  it('produces the versioned export format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const file = scriptToFile(makeScript());
    expect(file).toEqual({
      format: 'line-learner-script',
      version: SCRIPT_FILE_VERSION,
      title: 'My Play',
      language: 'en',
      characters: ['JULIET', 'NURSE', 'ROMEO'],
      entries: makeScript().entries,
      exportedAt: 5000
    });
  });

  it('excludes personal/local fields (role choice, id, timestamps)', () => {
    const json = JSON.parse(serializeScriptFile(makeScript()));
    expect(json).not.toHaveProperty('myCharacter');
    expect(json).not.toHaveProperty('myCharacters');
    expect(json).not.toHaveProperty('id');
    expect(json).not.toHaveProperty('createdAt');
    expect(json).not.toHaveProperty('updatedAt');
  });
});

describe('parseScriptFile', () => {
  it('round-trips an exported script', () => {
    const script = makeScript({ title: 'רומיאו ויוליה', language: 'he' });
    const parsed = parseScriptFile(serializeScriptFile(script));
    expect(parsed.title).toBe('רומיאו ויוליה');
    expect(parsed.language).toBe('he');
    expect(parsed.characters).toEqual(script.characters);
    expect(parsed.entries).toEqual(script.entries);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseScriptFile('{not json')).toThrow(ScriptFileParseError);
    expect(() => parseScriptFile('{not json')).toThrow('not valid JSON');
  });

  it.each(['null', '42', '"text"'])('rejects non-object JSON (%s)', (json) => {
    expect(() => parseScriptFile(json)).toThrow(ScriptFileParseError);
  });

  it('rejects files with the wrong format marker', () => {
    expect(() => parseScriptFile(validFileJson({ format: 'something-else' }))).toThrow(
      'not recognized'
    );
  });

  it('rejects files from a newer version', () => {
    expect(() => parseScriptFile(validFileJson({ version: SCRIPT_FILE_VERSION + 1 }))).toThrow(
      'newer version'
    );
  });

  it('rejects a missing version', () => {
    expect(() => parseScriptFile(validFileJson({ version: undefined }))).toThrow(
      ScriptFileParseError
    );
  });

  it.each([
    ['title', { title: 5 }],
    ['language', { language: 'fr' }],
    ['characters', { characters: 'ROMEO' }],
    ['entries', { entries: {} }],
    ['entry type', { entries: [{ id: 'a', order: 0, type: 'song', text: 'x' }] }],
    ['entry id', { entries: [{ order: 0, type: 'line', text: 'x' }] }],
    ['entry order', { entries: [{ id: 'a', order: '0', type: 'line', text: 'x' }] }],
    ['entry text', { entries: [{ id: 'a', order: 0, type: 'line' }] }],
    ['null entry', { entries: [null] }]
  ])('rejects malformed %s', (_label, overrides) => {
    expect(() => parseScriptFile(validFileJson(overrides))).toThrow('malformed');
  });

  it('defaults a missing exportedAt to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(12345);
    const parsed = parseScriptFile(validFileJson({ exportedAt: undefined }));
    expect(parsed.exportedAt).toBe(12345);
  });

  it('ignores unknown extra fields such as myCharacters', () => {
    const parsed = parseScriptFile(validFileJson({ myCharacters: ['ROMEO'], extra: true }));
    expect(parsed).not.toHaveProperty('myCharacters');
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('scriptFileToNewScript', () => {
  it('creates a fresh script with the given id, current timestamps and no role', () => {
    vi.useFakeTimers();
    vi.setSystemTime(99999);
    const file = parseScriptFile(validFileJson());
    const script = scriptFileToNewScript(file, 'new-id');
    expect(script).toEqual({
      id: 'new-id',
      title: 'My Play',
      language: 'en',
      characters: file.characters,
      entries: file.entries,
      createdAt: 99999,
      updatedAt: 99999
    });
  });
});

describe('downloadScriptFile', () => {
  it('downloads the JSON through a temporary link with a safe file name', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let downloadName = '';
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
        expect(this.href).toBe('blob:fake');
      });

    downloadScriptFile(makeScript({ title: 'Act 1: Romeo/Juliet?' }));

    expect(click).toHaveBeenCalledOnce();
    expect(downloadName).toBe('Act 1_ Romeo_Juliet_.linelearner.json');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull(); // link removed
  });
});

describe('canShareScriptFile', () => {
  it('returns false when navigator.canShare is unavailable (desktop)', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareScriptFile()).toBe(false);
  });

  it('returns what navigator.canShare reports for files', () => {
    const canShare = vi.fn(() => true);
    vi.stubGlobal('navigator', { canShare });
    expect(canShareScriptFile()).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] });

    canShare.mockReturnValue(false);
    expect(canShareScriptFile()).toBe(false);
  });

  it('returns false when navigator.canShare throws', () => {
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new TypeError('boom');
      }
    });
    expect(canShareScriptFile()).toBe(false);
  });
});

describe('shareScriptFile', () => {
  function stubShare(share: (data: ShareData) => Promise<void>, canShare = true) {
    const shareMock = vi.fn(share);
    vi.stubGlobal('navigator', { canShare: () => canShare, share: shareMock });
    return shareMock;
  }

  it('returns false without calling share when file sharing is unsupported', async () => {
    const share = stubShare(async () => {}, false);
    expect(await shareScriptFile(makeScript())).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it('shares the script as a .linelearner.json file', async () => {
    const share = stubShare(async () => {});
    expect(await shareScriptFile(makeScript({ title: 'My/Play' }))).toBe(true);

    expect(share).toHaveBeenCalledOnce();
    const data = share.mock.calls[0][0];
    expect(data.title).toBe('My/Play');
    expect(data.text).toContain('My/Play');
    expect(data.files).toHaveLength(1);
    const file = data.files![0];
    expect(file.name).toBe('My_Play.linelearner.json');
    expect(file.type).toBe('application/json');
  });

  it('uses "script" as the file name when the title is blank', async () => {
    const share = stubShare(async () => {});
    await shareScriptFile(makeScript({ title: '   ' }));
    expect(share.mock.calls[0][0].files![0].name).toBe('script.linelearner.json');
  });

  it('treats the user cancelling the share sheet as handled (no download fallback)', async () => {
    stubShare(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    expect(await shareScriptFile(makeScript())).toBe(true);
  });

  it('returns false on other share errors so the caller falls back to download', async () => {
    stubShare(async () => {
      throw new DOMException('not allowed', 'NotAllowedError');
    });
    expect(await shareScriptFile(makeScript())).toBe(false);
  });
});
