import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { db } from '../lib/db';
import { renderApp } from '../test/renderApp';
import type { Script, ScriptEntry } from '../types';

// Speech synthesis: each call to speak() waits until the test resolves it.
const tts = vi.hoisted(() => {
  const pending: { text: string; resolve: () => void }[] = [];
  return {
    pending,
    speak: vi.fn(
      (text: string) => new Promise<void>((resolve) => pending.push({ text, resolve }))
    ),
    stopSpeaking: vi.fn(),
    ensureVoicesLoaded: vi.fn(() => Promise.resolve())
  };
});
vi.mock('../lib/tts', () => ({
  speak: tts.speak,
  stopSpeaking: tts.stopSpeaking,
  ensureVoicesLoaded: tts.ensureVoicesLoaded
}));

// Speech recognition: hears whatever the test sets in `heard`.
const stt = vi.hoisted(() => ({ heard: '' }));
vi.mock('../lib/transcription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/transcription')>()),
  createTranscriptionController: () => ({
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(stt.heard),
    cancel: () => {}
  })
}));

function line(id: string, character: string, text: string): ScriptEntry {
  return { id, order: 0, type: 'line', character, characters: [character], text };
}

const ENTRIES: ScriptEntry[] = [
  line('e0', 'OBI', 'Hello there'),
  line('e1', 'ME', 'General Kenobi'),
  line('e2', 'OBI', 'You are a bold one'),
  line('e3', 'ME', 'Back away'),
  { id: 'e4', order: 4, type: 'scene', text: 'SCENE 2' },
  line('e5', 'OBI', 'Goodbye')
];

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    id: 's1',
    title: 'Test Play',
    language: 'en',
    characters: ['ME', 'OBI'],
    myCharacters: ['ME'],
    entries: ENTRIES.map((e, i) => ({ ...e, order: i })),
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

async function openPlayer(script = makeScript()) {
  await db.scripts.put(script);
  renderApp(`/scripts/${script.id}/play`);
  await screen.findByRole('heading', { name: script.title });
}

/** Finishes the oldest line still being spoken. */
async function finishSpeaking() {
  await act(async () => {
    tts.pending.shift()?.resolve();
  });
}

const counter = (text: string) => screen.findByText(text);

beforeEach(async () => {
  await db.scripts.clear();
  await db.attempts.clear();
  await db.settings.clear();
  tts.pending.length = 0;
  tts.speak.mockClear();
  tts.stopSpeaking.mockClear();
});

afterEach(cleanup);

describe('PlayerPage', () => {
  it('speaks other lines and pauses on my line', async () => {
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(tts.speak).toHaveBeenCalledWith('Hello there', 'en', 1));
    await finishSpeaking();

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByText('Your turn to say this line')).toBeTruthy();
    await counter('2 / 6');
  });

  it('continues after my line instead of pausing on it again', async () => {
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(tts.pending).toHaveLength(1));
    await finishSpeaking();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(tts.speak).toHaveBeenLastCalledWith('You are a bold one', 'en', 1));
    await counter('3 / 6');
    await finishSpeaking();
    await counter('4 / 6');
  });

  it('never runs two playback loops after pause and play', async () => {
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(tts.pending).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(tts.pending).toHaveLength(2));

    // The first (paused) run finishing its line must not move playback on.
    await finishSpeaking();
    await counter('1 / 6');

    await finishSpeaking();
    await counter('2 / 6');
    expect(tts.speak).toHaveBeenCalledTimes(2);
  });

  it('hides my line until I ask to see it', async () => {
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    await counter('2 / 6');
    expect(screen.queryByText('General Kenobi')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show my line/ }));
    expect(screen.getByText('General Kenobi')).toBeTruthy();

    // A new line starts hidden again.
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    await counter('4 / 6');
    expect(screen.queryByText('Back away')).toBeNull();
  });

  it('grades a recorded line and stores the attempt', async () => {
    stt.heard = 'general kenobi';
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    fireEvent.click(await screen.findByRole('button', { name: /Record my line/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Recording/ }));

    expect(await screen.findByText('Nice, that matches!')).toBeTruthy();
    await waitFor(async () => {
      const attempts = await db.attempts.where('scriptId').equals('s1').toArray();
      expect(attempts).toMatchObject([{ entryId: 'e1', passed: true }]);
    });
  });

  it('shows what was expected when the attempt misses', async () => {
    stt.heard = 'something else entirely';
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    fireEvent.click(await screen.findByRole('button', { name: /Record my line/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Recording/ }));

    expect(await screen.findByText(/Looks like you missed something/)).toBeTruthy();
    expect(screen.getByText(/Expected/).textContent).toContain('General Kenobi');
  });

  it('jumps to a line through the scene picker, which Escape closes', async () => {
    await openPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to...' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Jump to...' }));
    fireEvent.click(screen.getByRole('button', { name: /SCENE 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Goodbye/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await counter('6 / 6');
  });

  it('moves between scenes with the scene buttons', async () => {
    await openPlayer();
    expect(screen.getByText('Before scene 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    await counter('5 / 6');
    expect(screen.getByText('Scene 1 / 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next scene' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('asks to choose a role when none is set', async () => {
    await db.scripts.put(makeScript({ myCharacters: undefined }));
    renderApp('/scripts/s1/play');
    expect(
      await screen.findByText("Choose your character(s) first in the script's settings.")
    ).toBeTruthy();
  });

  it('says so when the script does not exist', async () => {
    renderApp('/scripts/missing/play');
    expect(await screen.findByText('This script was not found.')).toBeTruthy();
  });
});
