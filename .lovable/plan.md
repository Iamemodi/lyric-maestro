# MELLOW — Karaoke Video Creator

A full in-browser karaoke video maker. Users upload audio, paste lyrics, sync them word-by-word, customize the look, and export an MP4 — all client-side.

## Tech & conventions

- TanStack Router (file-based) for the step navigation
- Zustand for global project state (single store, persisted to `sessionStorage` so a refresh mid-flow doesn't wipe progress; the raw `ArrayBuffer` and `File` are kept in-memory only)
- Tailwind v4 + shadcn/ui (existing setup), dark violet theme as default with a light/dark toggle
- Web Audio API for decoding + playback; canvas-drawn waveform (downsampled to ~3000 amplitude bars)
- `@ffmpeg/ffmpeg` + `@ffmpeg/util` for the final MP4 mux (loaded lazily on the Generate page only — heavy WASM)
- Client-only everything: no server functions, no DB

## Theme

Dark mode default. Accent `#6D28D9` (violet) wired into `--primary`. Waveform played portion uses accent; unplayed uses `--muted-foreground` at low opacity. Light/dark toggle in the top-right of the app shell.

## Routes

```
src/routes/
  __root.tsx           QueryClient + theme + Toaster
  index.tsx            Upload page (entry)
  app.tsx              App shell layout (sidebar + waveform bar + <Outlet/>)
  app.basics.tsx
  app.options.tsx
  app.assignments.tsx
  app.line-timings.tsx
  app.resync.tsx
  app.word-timings.tsx
  app.generate.tsx
  app.video.tsx
  app.remix.tsx
```

The `/app` layout guards against missing audio — if no file is loaded, redirect to `/`.

## Global store (`src/store/project.ts`)

Holds the `ProjectState` from Step 13 plus playback state:
- `audioFile`, `audioBuffer` (decoded `AudioBuffer`), `rawArrayBuffer`
- `title`, `artist`, `lines: LyricLine[]`, `voices: Voice[]`, `options: VideoOptions`
- `playback: { isPlaying, currentTime, duration, zoom }`
- `generated: { blobUrl, progress, status }`
- Actions: `loadFile`, `setLyrics`, `assignVoice`, `setLineStart`, `setWordOffsets`, `applyGlobalOffset`, `updateOptions`, etc.

Default voices seeded: Voice 1 (#10B981), Voice 2 (#06B6D4), Voice 3 (#F59E0B). Default options match the spec (16:9, dark bg, system sans, fontSize 48, scroll mode, color voice mode, 3s intro/outro).

## Shared components

- `WaveformBar` — canvas, props `{ peaks, currentTime, duration, zoom, onSeek, markers? }`. Used on Line Timings, Resync, Word Timings, Assignments. Single instance lives in the app shell at the bottom; pages register optional markers/click handlers via a small context.
- `AudioEngine` — singleton wrapping a single `<audio>` element fed from a `URL.createObjectURL` of the uploaded file. Exposes `play/pause/seek` and pushes `currentTime` updates via `requestAnimationFrame`.
- `PreviewCanvas` — pure renderer: given `(options, lines, voices, currentTime)` paints one karaoke frame to a canvas. Used by Options preview AND by the Generate step (frame-by-frame).
- `Sidebar` — fixed 220px, lists steps with active highlight using `useRouterState`.

## Page-by-page

**`/` Upload** — Three-column layout: drop zone (reads file → `ArrayBuffer`, decodes via `AudioContext.decodeAudioData` in background), title/artist inputs, lyrics textarea. Submit → navigate `/app/basics`.

**`/app/basics`** — Editable title/artist, read-only line list, "Edit lyrics" button reopens textarea in a Dialog.

**`/app/options`** — Left settings panel with tabs (Video / Text / Frames / Voices) using shadcn `Tabs`. Right side `PreviewCanvas` rendering lorem ipsum lines using current options. Live updates via store subscription.

**`/app/assignments`** — Scrollable line list. Each row: voice color chip + lyric text. Click cycles voice; long-click / chevron opens a `Popover` with voice picker. Side panel manages voices (add/remove/recolor with shadcn color input).

**`/app/line-timings`** — Line list with currently-active line highlighted in voice color. Spacebar handler (`useEffect` on window): records `audioEngine.currentTime` to active line, advances. "Mark" button mirrors spacebar. Waveform click sets timestamp for the selected line. Each line shows formatted time (`m:ss.x`) or muted dash. "Play from here" button per line.

**`/app/resync`** — Slider `-5..+5s` (step 0.05). Live shows new times for first 5 lines. Apply button writes offset into all `startTime`s. "Reset all timings" with confirm dialog.

**`/app/word-timings`** — One line at a time. Words rendered as large chips. Spacebar or chip click records `(performance.now() - lineStartWallClock)` offset. Auto-advance when all words tapped. "Skip line" sets `words: []` (renderer falls back to whole-line highlight). Prev/Next line buttons.

**`/app/generate`** — Lazy-imports `@ffmpeg/ffmpeg`. Pipeline:
1. Create offscreen canvas at target resolution (1280×720 SD or 1920×1080 HD).
2. For frame `f` at time `t = f / fps`, call `PreviewCanvas.drawFrame(t)`.
3. Encode frames as PNG sequence written to FFmpeg's MEMFS (`writeFile('frame_0001.png', ...)`), batching ~30 frames at a time and yielding to keep UI responsive.
4. Write original audio file to MEMFS.
5. Run `ffmpeg -framerate 30 -i frame_%04d.png -i audio.ext -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out.mp4`.
6. Read result → Blob → object URL → store.

Progress bar fed from FFmpeg `progress` callback + frame-render percentage. Cancel button aborts the loop and `ffmpeg.terminate()`s. ETA from rolling average frame time.

**`/app/video`** — `<video controls>` with the generated blob. Buttons: Download (anchor with `download` attr), Finalize in HD (re-runs generate at 1080p with warning dialog), three placeholder icon buttons (Instrument separation / Crowd / Vocal-up) showing "Coming soon" toast.

**`/app/remix`** — Grid of cards, one per previous step, each with description + "Edit" link back to that step. State persists in the store, so edits are non-destructive.

## Renderer details (`PreviewCanvas`)

Pure function `drawFrame(ctx, { options, lines, voices, time })`:
- Fill background.
- Find active line (largest `startTime <= time`). If `time < firstLineStart` and intro frame configured, draw title card (title + artist centered).
- Display modes:
  - `fixed-1`: only the active line, centered.
  - `fixed-3`: previous + active + next, active in center, others dimmed with `sungColor`/`upcomingColor`.
  - `scroll`: vertical list, smooth-scrolled so active is centered.
- Within active line: if `words` populated, color words whose `offset <= (time - lineStart)*1000` with `activeColor` (or voice color in color mode); remaining words use `upcomingColor`. If no word timings, color the whole line with active color.
- Voice mode `title`: render `voice.label` above the line in voice color; line text in `activeColor`.
- Voice mode `color`: active word/line uses voice color directly.

Same function powers both the live preview and FFmpeg frame export — guarantees WYSIWYG.

## Risks / notes

- FFmpeg WASM bundle is ~25MB; loaded only when Generate is opened, with a "Loading encoder…" state. Cross-origin isolation headers (`COOP`/`COEP`) are needed for SharedArrayBuffer; we'll ship the single-threaded build of `@ffmpeg/ffmpeg` to avoid that requirement (slower but works without server header changes).
- Long videos × HD: encoding can take minutes. The progress bar + cancellation make this tolerable.
- Spacebar in inputs: handler ignores events when `event.target` is an input/textarea.
- Refresh wipes the audio file (Files can't be revived from sessionStorage). On `/app/*` routes if `audioFile` is null, redirect to `/` with a toast explaining.

## Out of scope (placeholders only)

Instrument separation, crowd mode, vocal-up — buttons render a "Coming soon" toast.
