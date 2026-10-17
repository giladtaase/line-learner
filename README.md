# Line Learner

A web app for actors to learn and rehearse their lines, in English and Hebrew.
Upload a script, pick your character, and run through the play: the app reads
everyone else's lines aloud and pauses on yours so you can say (or type) them
from memory. Grading is lenient, so small phrasing slips pass and real memory
gaps get flagged.

**Live app:** https://giladtaase.github.io/line-learner/

Everything runs in the browser. There is no backend and no account, and your
scripts and settings stay on your device in IndexedDB.

## Features

- **Script import:** upload a `.txt` or `.docx` file, or paste text. A
  heuristic parser detects character cues, stage directions, and scene/act
  headings in both English and Hebrew.
- **Correction editor:** fix anything the parser got wrong before you
  practice: edit character names and text, change an entry's type (line,
  direction, scene), and reorder, add, or remove entries. Your edits are
  saved with the script.
- **Multiple roles:** choose one or more characters to play, for example when
  you cover several small parts or understudy. Joint cues such as
  `ALON and OREN` or `אלון ואורן` count for each of those characters.
- **Read-through practice:**
  - Other characters' lines are spoken with the browser's speech synthesis,
    or shown as text.
  - Your own line is hidden by default so you are actually recalling it.
    Tap to reveal it.
  - Record yourself saying the line. The transcript is compared to the
    script with fuzzy matching that ignores inline stage directions and
    punctuation.
  - Move with prev/next line, prev/next scene, or a jump-to picker grouped by
    scene.
- **Speech-to-text:** uses the browser Web Speech API by default, which is
  free and needs no key. You can switch to OpenAI Whisper in Settings with
  your own API key.
- **Sharing scripts:** export a corrected script as a `.linelearner.json`
  file, through the native share sheet on mobile (WhatsApp, email, and so on)
  or as a download on desktop. Friends can import it without redoing the
  cleanup. Exports leave out your chosen role and your practice history.
- **Bilingual UI:** English and Hebrew, with automatic RTL layout.
- **Installable PWA:** use "Add to Home Screen" on mobile to install it, and
  it works offline after the first load.

## Script format tips

The parser works best when the script looks like this:

```
SCENE 1: The garden

ROMEO: But soft, what light through yonder window breaks?
(He steps forward)
JULIET.
Ay me.
```

- **Character cues:** `NAME:` or `NAME.` at the start of a line. The dialogue
  can be on the same line or on the lines after it. Names can include numbers
  (`GUARD 1`) and Hebrew letters.
- **Stage directions:** lines wrapped in `( )` or `[ ]`.
- **Scene headings:** `Scene 3`, `ACT II`, `תמונה א'`, `מערכה שנייה`,
  `פרק 2`, optionally followed by a title.

Anything it misreads can be fixed in the editor after upload.

## Settings

| Setting | What it does |
| --- | --- |
| UI language | English or Hebrew |
| Other lines | Whether other characters' lines are spoken aloud or shown as text, by default |
| My line input | Speak or type (saved, but typing isn't available in the player yet) |
| Transcription engine | Web Speech API (free, default) or OpenAI Whisper (needs an API key) |
| OpenAI API key | Stored only in your browser and sent only to OpenAI |
| Speech rate | Playback speed for other characters' lines |
| Leniency | Similarity threshold (default 0.55). Lower it to be more forgiving |

Speech recognition support varies by browser. Chrome, Edge, and Safari
support the Web Speech API. Firefox does not, so use Whisper there.

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run dev        # dev server at http://localhost:5173/line-learner/
npm test           # run unit tests once (Vitest)
npm run test:watch # tests in watch mode
npm run lint       # ESLint
npm run build      # type-check and build production output into dist/
npm run preview    # serve the built app locally
```

The microphone and PWA install only work on `localhost` or over HTTPS.

### Tech stack

Vite, React 18, TypeScript, Tailwind CSS, Dexie (IndexedDB), i18next,
react-router, mammoth (`.docx` parsing), and vite-plugin-pwa.

### Project layout

```
src/
  main.tsx                 # entry: settings provider + data router
  routes.tsx               # route table (shared with tests)
  App.tsx                  # layout: header, nav, <Outlet />
  settings/                # SettingsProvider + useSettings()
  hooks/
    usePlayback.ts         # read-through playback state (run ids, pause, continue)
    useErrorMessage.ts     # translates AppError codes for display
  components/
    ui.tsx                 # Button, IconButton, Modal
    ScriptsListPage.tsx    # script library, upload/paste/import
    ScriptEditorPage.tsx   # review and correct a parsed script, pick roles
    PlayerPage.tsx         # read-through practice
    player/                # CurrentEntry, RecordPanel, JumpToDialog, LineText
    SettingsPage.tsx
  lib/                     # no React; unit-tested
    scriptParser.ts        # text -> entries (cues, directions, scenes, joint cues)
    fuzzyMatch.ts          # normalization and similarity grading
    playback.ts            # auto-play loop
    scenes.ts              # scene navigation helpers
    transcription.ts       # Web Speech / Whisper speech-to-text
    tts.ts                 # speech synthesis for other characters' lines
    scriptFile.ts          # .linelearner.json export/import format
    errors.ts              # AppError: user-facing errors with translatable codes
    db.ts                  # Dexie schema, settings defaults and migrations
  locales/                 # en.json, he.json
  test/                    # test setup and renderApp() helper
  types.ts
```

Tests sit next to the code they cover (`*.test.ts` for `lib`, `*.test.tsx`
for pages, using React Testing Library and `renderApp()`). IndexedDB is
replaced by `fake-indexeddb` in tests. User-facing errors are thrown as
`AppError` with a code; add its text under `errors` in both locale files.

### Deployment

Every push to `master` runs the GitHub Actions workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). It runs the
tests, builds the app, and publishes `dist/` to GitHub Pages. The app is
served under `/line-learner/`, which is set as `base` in
[vite.config.ts](vite.config.ts). Because GitHub Pages has no server-side
rewrites, [public/404.html](public/404.html) sends deep links back to the app
root so React Router can restore them. If you fork the repo under a different
name, update the base path in both files.

## Roadmap

- More practice modes: cue, short cue, context only, random drill, and
  progressive hints. The `PracticeMode` type already reserves them.
- Progress tracking that brings weak lines up more often.
- An optional fully offline speech-to-text model that runs in the browser
  (Whisper via Transformers.js).
