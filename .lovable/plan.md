# Plan: Bug fixes & polish

## Bug fixes

### 1. Object URL leaks (`src/store/project.ts`, `src/routes/app.generate.tsx`)
- In `loadFile`, before assigning new `audioUrl`/`audioFile`, `URL.revokeObjectURL(get().audioUrl)` if present.
- In `setGenerated`, revoke the previous `generated.blobUrl` before storing the new one.
- On root unmount (`__root.tsx`) revoke any remaining URLs as a safety net.

### 2. FFmpeg MEMFS OOM (`src/routes/app.generate.tsx`)
- After every frame is written, keep only the last N frames in MEMFS by encoding **in chunks**: render frames in batches of ~300 (10 s @ 30 fps), encode each batch into a numbered intermediate `seg_NN.mp4` (`-c:v libx264 -an`), `deleteFile` all the JPGs in that batch, then concat segments at the end with the audio in one final pass.
- Fallback simpler path if concat is brittle: `deleteFile(prev.jpg)` immediately after each `writeFile` succeeds for the *previous* frame — keeps only ~2 files alive but still requires final encode pass over names that no longer exist; so we go with the chunked approach.

### 3. Self-host FFmpeg core (no unpkg)
- `bun add @ffmpeg/core@0.12.6`.
- In `app.generate.tsx`, import the core URLs via Vite asset imports:
  ```ts
  import coreURL from "@ffmpeg/core/dist/umd/ffmpeg-core.js?url";
  import wasmURL from "@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url";
  await ffmpeg.load({ coreURL, wasmURL });
  ```
  Vite fingerprints + caches the file via the SW/HTTP cache, so subsequent renders re-use it.

### 4. `getCanvasSize` honours `base` (`src/lib/karaoke-renderer.ts`)
- Compute width from base + aspect:
  ```ts
  const h = base;
  const w = aspect === "16:9" ? Math.round(base * 16/9) : Math.round(base * 4/3);
  return { w, h };
  ```

### 5. Listener pile-up (`src/routes/app.line-timings.tsx`)
- Wrap `mark` in `useRef`/`useEvent` pattern (latest-callback ref) and add `[]` dep array on the effect.

### 6. Cancel detection (`src/routes/app.generate.tsx`)
- Replace `e.message === "cancelled"` with a flag `cancelRef.current === true`. Any error during cancel is treated as a clean cancellation.

### 7. Leaked AudioContext on decode failure (`src/store/project.ts`)
- Move `ctx.close()` into a `finally` block.

### 8. Upload page 3-col grid (`src/routes/index.tsx`)
- Add a third column "Track info" with editable Title/Artist `Input`s bound to local state (already exists as `t`, `a`) so users can enter metadata up front. Keep `setMeta` call in `submit`.

### 9. `rawArrayBuffer` retained forever (`src/store/project.ts`)
- After successful decode, `set({ rawArrayBuffer: null })`. It's never read again. (Confirmed via `rg "rawArrayBuffer"`.)

## Missing things

### 10. README
- Create `README.md`: project description, features, local dev (`bun install`, `bun run dev`), build, deploy notes (Cloudflare Worker), browser support, privacy ("everything runs in your browser"), credits.

### 11. Package name
- `package.json` → `"name": "mellow-karaoke"`.

### 12. LRC import / export
- New `src/lib/lrc.ts` with `parseLRC(text): {time:number, text:string}[]` and `toLRC(lines, title, artist): string` (supports `[mm:ss.xx]` and per-word `<mm:ss.xx>` enhanced LRC).
- On Upload page, accept `.lrc` in lyrics file picker — if LRC, set lyrics text + populate `startTime` for each line.
- On Resync page, add **Export .lrc** button and **Import .lrc** button (overwrites timings only, not text, when line count matches).

### 13. Undo for lyrics edit (`src/routes/app.basics.tsx`)
- Before `setLyrics`, snapshot current `lines` to a ref/state; show a "Undo" action in the success toast for ~10 s that restores the prior lines via a new store action `restoreLines(lines)`.

### 14. Remove stub buttons (`src/routes/app.video.tsx`)
- Delete the three "coming soon" buttons (Instrument separation, Crowd mode, Vocal-up).

### 15. Keyboard shortcut discoverability
- Already shows kbd hint on Line Timings; add the same on Word Timings + tooltip on the **Mark** button. Add a small "Shortcuts" popover (Space = mark, ←/→ = ±0.1 s, Enter = play/pause) on both timing pages.

### 16. Mobile fallback warning
- `useIsMobile()` already exists. On Line Timings + Word Timings, show a small banner on touch devices: "Tap-sync works best with a keyboard. Use the on-screen Mark button or load an .lrc."

### 17. Auto-sync needs re-uploaded audio — pre-warn
- In `runAiSync` we already toast an error if no `audioBuffer`. Add a **persistent banner** on Line Timings whenever `lines.length > 0 && !audioBuffer && audioUrl == null` saying "Re-load your audio to enable AI Auto-Sync" with a `<Link to="/">` button.

### 18. Live preview during generation (`src/routes/app.generate.tsx`)
- Render the encode canvas itself into the page (instead of detached `document.createElement`), scaled down via CSS, so users watch frames render live. Add an "Hide preview" toggle for performance.

## Out of scope (this turn)
- **Tests** — no Vitest setup currently; adding test infra + meaningful coverage is a separate large task. Will be skipped unless the user asks.

## Verification
- Reload audio twice → DevTools Memory shows previous blob URL released.
- Render a 4-min song → MEMFS file count never exceeds ~600; render completes without OOM.
- Disconnect from unpkg → render still succeeds (FFmpeg loads from `/assets/...`).
- Upload page on desktop → 3 visible columns, Title/Artist editable.
- Failed decode → no `AudioContext` warnings in console after 6+ tries.
- Export `.lrc` → re-import on a fresh project produces identical line timings.
- Mobile viewport → banner visible on Line Timings.
