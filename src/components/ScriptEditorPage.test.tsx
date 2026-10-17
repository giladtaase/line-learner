import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db } from '../lib/db';
import { renderApp } from '../test/renderApp';
import type { Script } from '../types';

const script: Script = {
  id: 's1',
  title: 'Test Play',
  language: 'en',
  characters: ['ME', 'OBI'],
  entries: [
    { id: 'e0', order: 0, type: 'line', character: 'OBI', characters: ['OBI'], text: 'Hello there' },
    { id: 'e1', order: 1, type: 'line', character: 'ME', characters: ['ME'], text: 'General Kenobi' }
  ],
  createdAt: 1,
  updatedAt: 1
};

async function openEditor() {
  await db.scripts.put(script);
  const view = renderApp('/scripts/s1/edit');
  await screen.findByRole('heading', { name: 'Test Play' });
  return view;
}

function editFirstLine() {
  fireEvent.change(screen.getByDisplayValue('Hello there'), { target: { value: 'Hello again' } });
}

beforeEach(async () => {
  await db.scripts.clear();
  await db.settings.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ScriptEditorPage', () => {
  it('stays on the editor when leaving with unsaved edits is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router } = await openEditor();
    editFirstLine();

    // A header link, not the editor's own Back button.
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/scripts/s1/edit');
    expect(screen.getByDisplayValue('Hello again')).toBeTruthy();
  });

  it('leaves when the user confirms discarding edits', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { router } = await openEditor();
    editFirstLine();

    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((await db.scripts.get('s1'))?.entries[0].text).toBe('Hello there');
  });

  it('leaves without asking when nothing changed', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { router } = await openEditor();

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('requires a role, then saves and opens the player without asking', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    window.scrollTo = vi.fn();
    const { router } = await openEditor();
    editFirstLine();

    fireEvent.click(screen.getAllByRole('button', { name: 'Save script' })[0]);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/scripts/s1/edit');

    fireEvent.click(screen.getByRole('button', { name: 'ME' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save script' })[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/scripts/s1/play'));
    expect(confirm).not.toHaveBeenCalled();
    const saved = await db.scripts.get('s1');
    expect(saved?.myCharacters).toEqual(['ME']);
    expect(saved?.entries[0].text).toBe('Hello again');
  });
});
