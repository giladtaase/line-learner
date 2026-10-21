# Line Learner

An app for actors to learn and rehearse their lines, in English and Hebrew,
on the web, on mobile web, and as an Android app.
Upload a script, pick your character, and run through the play: the app reads
everyone else's lines aloud and pauses on yours so you can say (or type) them
from memory. Grading is lenient, so small phrasing slips pass and real memory
gaps get flagged.

**Live app:** https://line-learner.com

Everything runs on your device. There is no backend and no account, and your
scripts and settings stay on your device in IndexedDB. The website and the
Android app keep separate libraries; move scripts between them with
Share / Export and Import.

## Features

- **Script import:** upload a `.txt`, `.docx` or `.pdf` file, or paste text. A
  heuristic parser detects character cues, stage directions, and scene/act
  headings in both English and Hebrew. With an Anthropic API key, Claude can
  parse instead: it copes with title pages, cast lists and unusual cues, and
  for PDFs it looks at the pages to skip crossed-out text and editing notes.
  Claude only labels lines; the text always comes from your file.
- **Scene updates:** upload a file with new versions of some scenes (e.g. a
  PDF of rewritten scenes 9-12). Scenes are matched by number, new ones are
  slotted in order, and you see what will change before it is applied.
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
  - Move with prev/next line, prev/next scene, skip to your next cue, or a
    jump-to picker grouped by scene.
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
- **Android app:** the same app, with Android's own speech engines, share
  sheet and back button. See [Android app](#android-app).

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
support the Web Speech API. Firefox does not, so use Whisper there. In the
Android app, the free option ("Built-in") uses the phone's speech recognition.

## Development

Requirements: Node.js 22+.

```bash
npm install
npm run dev        # dev server at http://localhost:5173/
npm test           # run unit tests once (Vitest)
npm run test:watch # tests in watch mode
npm run lint       # ESLint
npm run build      # type-check and build production output into dist/
npm run preview    # serve the built app locally
```

The microphone and PWA install only work on `localhost` or over HTTPS.

### Android app

The Android app is the same web code running in a Capacitor shell
([capacitor.config.ts](capacitor.config.ts), project in [android/](android/)).
It needs Android Studio (or a JDK 21 and the Android SDK).

```bash
npm run android:sync  # build the web app for Android and copy it into android/
npm run android:open  # open the project in Android Studio
npm run android:run   # build, install and launch on a device or emulator
```

`android:sync` builds with `--mode native`, which leaves out the PWA service
worker. Run it after every web change you want in the app. To build an APK
from the command line, run `./gradlew assembleDebug` in `android/`.

A few things the Android WebView can't do are done natively, behind the same
functions the web app calls, so pages don't know the difference:

| Feature | Web | Android app |
| --- | --- | --- |
| Speaking other lines (`lib/tts.ts`) | `speechSynthesis` | Android text-to-speech (`@capacitor-community/text-to-speech`) |
| Free speech recognition (`lib/transcription.ts`) | Web Speech API | Android `SpeechRecognizer`, via the app's own plugin [SpeechPlugin.java](android/app/src/main/java/com/line_learner/app/SpeechPlugin.java), which keeps listening through pauses |
| Share / Export (`lib/scriptFile.ts`) | Web Share or a download | File in the app cache + Android share sheet |
| Back button | - | Closes a dialog, else goes back, else exits ([platform/initNative.ts](src/platform/initNative.ts)) |

`isNativeApp()` in [src/platform/native.ts](src/platform/native.ts) decides
which one runs. Whisper recording and AI parsing work the same in both.

Speech on Android uses the phone's Google speech services. For Hebrew,
the Hebrew voice and recognition language may need to be added in the
phone's settings.

Every push to `master` also builds a debug APK in GitHub Actions
([android.yml](.github/workflows/android.yml)); download it from the run's
artifacts. App icons come from [assets/](assets/) via
`npx @capacitor/assets generate --android`.

### Tech stack

Vite, React 18, TypeScript, Tailwind CSS, Dexie (IndexedDB), i18next,
react-router, mammoth (`.docx` parsing), pdf.js (`.pdf` text), the Anthropic
SDK (optional AI parsing), vite-plugin-pwa, and Capacitor (Android app).

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
    transcription.ts       # Web Speech / Android / Whisper speech-to-text
    tts.ts                 # speech synthesis for other characters' lines
    scriptFile.ts          # .linelearner.json export/import format
    errors.ts              # AppError: user-facing errors with translatable codes
    db.ts                  # Dexie schema, settings defaults and migrations
  locales/                 # en.json, he.json
  test/                    # test setup and renderApp() helper
  platform/
    native.ts              # isNativeApp(): web or Android app
    initNative.ts          # Android-only setup (back button)
  types.ts
android/                   # Android project (Capacitor), incl. SpeechPlugin.java
```

Tests sit next to the code they cover (`*.test.ts` for `lib`, `*.test.tsx`
for pages, using React Testing Library and `renderApp()`). IndexedDB is
replaced by `fake-indexeddb` in tests. User-facing errors are thrown as
`AppError` with a code; add its text under `errors` in both locale files.

### Deployment

Every push to `master` runs the GitHub Actions workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). It runs the
tests, builds the app, and publishes `dist/` to GitHub Pages, which serves it
at https://line-learner.com. The custom domain is set in this repo's Settings →
Pages only (an Actions deploy doesn't use a `CNAME` file), so other projects
under giladtaase.github.io keep their URLs. Because GitHub
Pages has no server-side rewrites, [public/404.html](public/404.html) sends
deep links back to the app root so React Router can restore them.

## Roadmap

- More practice modes: cue, short cue, context only, random drill, and
  progressive hints. The `PracticeMode` type already reserves them.
- Progress tracking that brings weak lines up more often.
- Control over merging a character's young and adult versions (e.g. "איתן
  הילד" and "איתן"). AI parsing merges them today, which is wrong when a
  different actor plays the young version.
- An optional fully offline speech-to-text model that runs in the browser
  (Whisper via Transformers.js).
