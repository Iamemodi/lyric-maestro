# Plan — Upload, validation, image, per-word AI sync

## 1. Validation utility (new)

`src/lib/validation.ts` — pure functions used by upload UIs:
- `validateAudio(file)` — accepts `.mp3 .wav .m4a .flac` (and `.ogg .mp4` kept for back-compat); max **100 MB**
- `validateImage(file)` — accepts `.jpg .jpeg .png .gif`; max **10 MB**
- `validateLyricsFile(file)` — accepts `.txt`; max **1 MB**
- Each returns `{ ok: true } | { ok: false, error: string }` with friendly messages (wrong type, too large, empty)

## 2. Store changes (`src/store/project.ts`)

Add to `ProjectState`:
- `coverImageDataUrl: string | null` (persisted — small data URL after downscale)
- `options.useImageBackground: boolean` (default false)
- `options.useImageIntro: boolean` (default false)

New actions:
- `loadCoverImage(file)` — validates, downscales to max 1920px via canvas, stores as JPEG data URL
- `clearCoverImage()`

`partialize` includes `coverImageDataUrl` so it survives reload.

## 3. Upload page (`src/routes/index.tsx`)

- Wire `validateAudio` into `onFile`; surface toast errors.
- Add a **Load .txt** button under the lyrics textarea — reads file, validates, fills the textarea.
- Add an **upload progress bar** (FileReader/decode is fast but we surface a determinate bar during `loadFile`: bytes read → decoding → peaks).
  - Add `loadProgress: { phase: 'idle'|'reading'|'decoding'|'peaks'|'done', percent: number }` to the store; `loadFile` updates it; UI shows shadcn `<Progress />`.

## 4. Basics page (`src/routes/app.basics.tsx`)

Add two new cards:
- **Replace lyrics** — textarea + "Load .txt" with the same validator; calls `setLyrics`.
- **Cover image** — drop zone using `validateImage` + `loadCoverImage`, preview thumbnail, remove button.

## 5. Options page (`src/routes/app.options.tsx`)

Add a "Background" section:
- Toggle: **Use image as background** (disabled if no cover image)
- Toggle: **Show image during intro only** (mutually exclusive with above; if both off → solid color)
- Live preview reflects choice via `PreviewCanvas`.

## 6. Renderer (`src/lib/karaoke-renderer.ts`)

Extend `drawFrame` opts:
- Accept optional `coverImage: HTMLImageElement | null`
- Before painting solid background:
  - If `useImageBackground` and image loaded → draw cover (cover-fit) then dark overlay for legibility
  - Else if `useImageIntro` and `time < introSeconds` → draw cover full-bleed with title/artist overlay; skip lyric layer
  - Else → existing solid color
- `PreviewCanvas` and the FFmpeg frame loop both pass a preloaded `HTMLImageElement` (decoded once from `coverImageDataUrl`).

## 7. Per-word AI sync (`src/lib/ai-sync.functions.ts` + line-timings page)

- Add a second server fn `aiSyncWords` that takes `{ audioBase64, audioMime, lines: [{index, text, startSeconds, endSeconds}] }` and returns `[{ lineIndex, wordOffsetsMs: number[] }]` via Gemini tool calling (`submit_word_alignment`).
- After `aiSyncLines` succeeds, automatically chain `aiSyncWords` (using line start + next-line start as window) and call `setWordOffsets` per line.
- Add a separate **"AI Sync Words"** button on the **Word Timings** page for re-running just word sync; show `Loader2` spinner and toast on success/error.
- Validate audio size (<20 MB) before sending; show explicit error if larger.

## 8. Cross-device responsive pass

- Sidebar: collapse to a top bar with horizontal scroll on `<md` breakpoints.
- Upload page grid: already `md:grid-cols-3` — make sections stack cleanly on mobile, ensure drop zone min-height shrinks.
- Waveform footer: hide zoom buttons on `<sm`, keep play/seek + time.
- Generate/Video pages: ensure preview canvas scales to container width.

## 9. Error handling polish

- Single `useUploadError` toast helper to standardize messages.
- Network/AI failures: catch 402/429 from gateway and show actionable toast ("Add credits" / "Slow down").
- Guard all `URL.createObjectURL` with cleanup on unmount where applicable.

## Out of scope

- No backend storage — all uploads stay in-browser (matches existing architecture).
- No new routes; everything fits into existing 9-step flow.

## Files touched

- new: `src/lib/validation.ts`
- edit: `src/store/project.ts`, `src/routes/index.tsx`, `src/routes/app.basics.tsx`, `src/routes/app.options.tsx`, `src/lib/karaoke-renderer.ts`, `src/components/PreviewCanvas.tsx`, `src/components/Sidebar.tsx`, `src/components/Waveform.tsx`, `src/lib/ai-sync.functions.ts`, `src/routes/app.line-timings.tsx`, `src/routes/app.word-timings.tsx`, `src/routes/app.generate.tsx`
