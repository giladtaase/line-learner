import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db, DEFAULT_SETTINGS } from '../lib/db';
import { AppError } from '../lib/errors';
import { renderApp } from '../test/renderApp';

const ai = vi.hoisted(() => ({ parseScriptWithAI: vi.fn() }));
vi.mock('../lib/aiParser', () => ({ parseScriptWithAI: ai.parseScriptWithAI }));

const SCRIPT = 'MARGARET\nTom, you are late.';

async function openLibrary(anthropicApiKey?: string) {
  await db.settings.put({ ...DEFAULT_SETTINGS, anthropicApiKey });
  const view = renderApp('/');
  await screen.findByRole('heading', { name: 'Upload script' });
  return view;
}

function pasteAndParse() {
  fireEvent.change(screen.getByLabelText('Or paste script text'), { target: { value: SCRIPT } });
  fireEvent.click(screen.getByRole('button', { name: 'Parse script' }));
}

beforeEach(async () => {
  await db.scripts.clear();
  await db.settings.clear();
  ai.parseScriptWithAI.mockReset();
});

afterEach(cleanup);

describe('ScriptsListPage parsing', () => {
  it('uses the built-in parser when no Anthropic key is set', async () => {
    const { router } = await openLibrary();
    const checkbox = screen.getByRole('checkbox', { name: 'Parse with AI (Claude)' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText('Add an Anthropic API key in Settings to use this.')).toBeTruthy();

    pasteAndParse();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/edit$/));
    expect(ai.parseScriptWithAI).not.toHaveBeenCalled();
  });

  it('parses with AI when a key is set, using its result', async () => {
    ai.parseScriptWithAI.mockResolvedValue({
      language: 'en',
      characters: ['MARGARET'],
      entries: [
        { id: 'a', order: 0, type: 'line', character: 'MARGARET', characters: ['MARGARET'], text: 'Tom, you are late.' }
      ]
    });
    const { router } = await openLibrary('sk-ant-test');
    pasteAndParse();

    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/edit$/));
    expect(ai.parseScriptWithAI).toHaveBeenCalledWith(SCRIPT, 'sk-ant-test', {
      onProgress: expect.any(Function)
    });
    const [saved] = await db.scripts.toArray();
    expect(saved.entries[0].text).toBe('Tom, you are late.');
  });

  it('can be switched off for one upload', async () => {
    const { router } = await openLibrary('sk-ant-test');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Parse with AI (Claude)' }));
    pasteAndParse();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/edit$/));
    expect(ai.parseScriptWithAI).not.toHaveBeenCalled();
  });

  it('shows a translated error and stays put when AI parsing fails', async () => {
    ai.parseScriptWithAI.mockRejectedValue(new AppError('aiBadKey', 'rejected'));
    const { router } = await openLibrary('sk-ant-bad');
    pasteAndParse();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The Anthropic API key was rejected. Check it in Settings.'
    );
    expect(router.state.location.pathname).toBe('/');
    expect(await db.scripts.count()).toBe(0);
  });
});
