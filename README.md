# Line Learner

A bilingual (English/Hebrew) web app to help actors learn and rehearse their
lines for plays. Upload a script, pick your character, and practice with
multiple modes: full read-through, cue-based prompts, random drills, and
progressive hints. Supports speaking or typing your lines, with lenient
grading that only flags real memory gaps rather than small phrasing slips.

## Status: Phase 1 (scaffold)

Implemented so far:
- Project scaffold: Vite + React + TypeScript + Tailwind CSS, configured as a PWA.
- i18n (English/Hebrew) with automatic RTL layout switching.
- Local-only storage via IndexedDB (Dexie) — no backend server.
- Script upload (.txt and .docx via `mammoth`) or paste, with a heuristic
  parser that detects character cues and stage directions in both English
  and Hebrew scripts.
- Manual correction editor to fix mis-parsed lines/characters and choose
  "my character."
- Full read-through practice mode: the app speaks other characters' lines
  (via the browser's Speech Synthesis API) or displays them as text, and
  pauses on your lines for you to continue.
- Settings page: UI language, default line modes, transcription provider
  selection (Whisper API vs free browser Web Speech API) + API key storage,
  TTS speed, and correction leniency threshold.

## Coming in later phases
- Phase 2: mic recording, Whisper/Web Speech transcription, typed-line
  alternative, fuzzy-match grading, Cue mode.
- Phase 3: Short-cue, Context-only, Random drill, Progressive hint modes.
- Phase 4: progress tracking / weak-line prioritization, PWA offline polish,
  Hebrew RTL refinement pass.
- Future: optional fully offline, in-browser Whisper model (Transformers.js).

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (typically http://localhost:5173) in your
browser. On mobile, you can "Add to Home Screen" once deployed/served over
HTTPS (or localhost) since it's a PWA.

## Script format tips

The parser looks for lines like `CHARACTER:` or `CHARACTER.` (English, all
caps, or any case for Hebrew names) followed by dialogue, and treats
parenthesized/bracketed lines as stage directions. If your script doesn't
parse perfectly, use the review/correction screen after upload to fix
character names, merge/split lines, or change line type — your edits are
saved with the script.
