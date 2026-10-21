import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportScript, scriptFileAccept } from './scriptFile';
import type { Script } from '../types';

vi.mock('../platform/native', () => ({ isNativeApp: () => true }));

const plugins = vi.hoisted(() => ({
  writeFile: vi.fn(() => Promise.resolve({ uri: 'file:///cache/Hamlet.linelearner.json' })),
  share: vi.fn(() => Promise.resolve({}))
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: plugins.writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' }
}));
vi.mock('@capacitor/share', () => ({ Share: { share: plugins.share } }));

const script: Script = {
  id: 's1',
  title: 'Hamlet',
  language: 'en',
  characters: ['HAMLET'],
  entries: [{ id: 'e1', order: 0, type: 'line', character: 'HAMLET', text: 'To be' }],
  myCharacters: ['HAMLET'],
  createdAt: 1,
  updatedAt: 1
};

beforeEach(() => {
  plugins.writeFile.mockClear();
  plugins.share.mockReset();
  plugins.share.mockResolvedValue({});
});

describe('exportScript in the Android app', () => {
  it('writes the file to the cache and opens the share sheet with it', async () => {
    await exportScript(script);
    expect(plugins.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Hamlet.linelearner.json', directory: 'CACHE' })
    );
    const [{ data }] = plugins.writeFile.mock.calls[0] as unknown as [{ data: string }];
    expect(JSON.parse(data)).toMatchObject({ format: 'line-learner-script', title: 'Hamlet' });
    expect(JSON.parse(data)).not.toHaveProperty('myCharacters');
    expect(plugins.share).toHaveBeenCalledWith({
      title: 'Hamlet',
      files: ['file:///cache/Hamlet.linelearner.json']
    });
  });

  it('treats closing the share sheet as success', async () => {
    plugins.share.mockRejectedValue(new Error('Share canceled'));
    await expect(exportScript(script)).resolves.toBeUndefined();
  });

  it('reports other share failures', async () => {
    plugins.share.mockRejectedValue(new Error("Can't share while sharing is in progress"));
    await expect(exportScript(script)).rejects.toThrow('sharing is in progress');
  });
});

describe('scriptFileAccept in the Android app', () => {
  it('also accepts files Android labels as generic data', () => {
    expect(scriptFileAccept()).toBe('.json,application/octet-stream');
  });
});
