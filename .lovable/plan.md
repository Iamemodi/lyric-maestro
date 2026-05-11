# Plan: Local sync engine + reliable video render

## Part 1 — Replace Gemini with a local lyrics-sync engine

Goal: keep the "AI Auto-Sync" buttons but power them entirely with our own audio analysis. No external API, no key, no upload limits. Runs on the already-decoded `AudioBuffer` in the project store.

### Approach (no Gemini, no third-party model)

Use classic onset detection on the existing `audioBuffer`:

1. **Vocal-band envelope.** Resample channel 0 to mono and apply a simple band-pass (200 Hz – 4 kHz approximation via biquad filters from `OfflineAudioContext`) to emphasise vocals over drums.
2. **Spectral-flux onset detection.** Frame the signal (1024 samples, hop 512, ~46 ms / 23 ms at 22.05 kHz). For each frame compute magnitude FFT (use `OfflineAudioContext` + `AnalyserNode` or a small radix-2 FFT). Compute positive spectral flux frame-to-frame, normalise by a moving median, and pick peaks above an adaptive threshold with a 120 ms refractory window.
3. **Result:** a sorted list of onset times (seconds) — candidate "word starts".
4. **Line alignment.** Group onsets into clusters separated by silence gaps > 350 ms. Take the first onset of each cluster as a candidate **line start**. Match the first N clusters to the N lyric lines in order; if onsets > lines, distribute by largest gaps; if < lines, interpolate between known starts using line length (char count) as weight. Result fills `setLineStart` for every line.
5. **Word alignment.** Within each line's window `[startTime, nextLineStart]`, take the onsets that fall inside, then assign one onset per word in order. If counts differ, linearly distribute remaining words proportional to syllable count (vowel-group heuristic). Output `wordOffsetsMs[]` for `setWordOffsets`.

All math runs on the main thread in chunks (`await new Promise(r => setTimeout(r, 0))` every ~50 frames) to keep UI responsive. For songs >5 min we offload to a `Worker` created via `new Worker(new URL(...), { type: 'module' })`.

### Files

- **New** `src/lib/sync-engine.ts` — pure functions:
  - `detectOnsets(buffer: AudioBuffer): Promise<number[]>`
  - `alignLines(onsets, lineTexts, duration): { index, startSeconds }[]`
  - `alignWords(onsets, lines): { lineIndex, wordOffsetsMs }[]`
  - `autoSync(buffer, lineTexts): { lines, words }` — convenience.
- **Edit** `src/routes/app.line-timings.tsx`
  - Remove imports of `aiSyncLines`, `aiSyncWords`.
  - `runAiSync` now calls `autoSync(audioBuffer, lines.map(l => l.text))` and applies `setLineStart` + `setWordOffsets`. Keep the same button label ("AI Auto-Sync") and toast UX.
  - Drop the 20 MB / re-upload guards; require only `audioBuffer`.
- **Edit** `src/routes/app.word-timings.tsx`
  - Replace `aiSyncWords` server-fn call with local `alignWords` using `audioBuffer` + already-set line starts.
- **Delete** `src/lib/ai-sync.functions.ts` (no longer referenced).
- **Edit** `src/store/project.ts` — no schema change; just confirm `audioBuffer` is in state (it already is, non-persisted).

### UX

- Same buttons, same toasts. Replace "AI is listening to your audio…" with "Analyzing audio…".
- Show a small progress percentage in the toast (`toast.loading` updated as onset detection advances).
- If `audioBuffer` is missing (page refresh — buffer is not persisted), prompt user to re-load the audio file from `/`.

## Part 2 — Fix the video render

Current symptoms: ffmpeg.wasm load fails on the published site because:
- Multi-threaded core needs `SharedArrayBuffer`, which needs COOP/COEP headers. We set those in `vite.config.ts` for dev only — production (Cloudflare Worker) sends none.
- `toBlobURL` of the unpkg core can also be blocked by CSP / network on production.

Fix:
1. **Switch to the single-threaded ffmpeg core** (`@ffmpeg/core` 0.12.x non-MT build). It does not need `SharedArrayBuffer`, so it works without COOP/COEP. Bundle the `.js` and `.wasm` as static assets via `?url` so they are served from our own origin (no unpkg, no `toBlobURL`).
   - `bun add @ffmpeg/core`
   - In `src/routes/app.generate.tsx`:
     ```ts
     import coreURL from "@ffmpeg/core/dist/umd/ffmpeg-core.js?url";
     import wasmURL from "@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url";
     await ffmpeg.load({ coreURL, wasmURL });
     ```
2. **Keep COOP/COEP for dev** (already set) but add the same headers in production via the SSR root response in `src/server.ts` so multi-threaded paths still work if we ever switch back.
3. **Robust frame writes.** Current loop awaits `canvas.toBlob` then `arrayBuffer` per frame — fine, but add a try/catch around `ffmpeg.writeFile` and abort with a clear toast on failure (currently a write error silently kills the run).
4. **Use a stable JPEG quality and reset the canvas transform once.** `ctx.scale(scale, scale)` is called once and then `ctx.setTransform(scale,0,0,scale,0,0)` inside the loop — keep the `setTransform` per frame (correct), but ensure `drawFrame` receives the logical `width/height` (`w`,`h`), not the scaled pixel size (already correct).
5. **Memory clean-up.** After encode: `ffmpeg.deleteFile` the JPG frames and the audio in a final loop, then `ffmpeg.terminate()`. Long songs currently OOM on mobile because frames stay in MEMFS.
6. **Handle missing audio.** Guard at the top: if `audioFile` is null but a previous render exists, prompt to re-upload; do not throw a raw exception.
7. **Cancel button.** `ffmpeg.terminate()` before reload so cancel during encode actually stops it.

### Files

- **Edit** `src/routes/app.generate.tsx` — load core via `?url` imports; cleanup MEMFS; better cancel; clearer errors.
- **Edit** `src/server.ts` — add `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response headers on HTML responses (defensive; not required by the single-thread core).
- **Add dependency** `@ffmpeg/core` (`bun add @ffmpeg/core`).
- No change to `app.video.tsx`; it just consumes `generated.blobUrl`.

## Out of scope

- No new server functions are introduced; the sync engine is purely client-side because the Cloudflare Worker SSR runtime cannot run Web Audio / `OfflineAudioContext`. That is the correct "own backend" boundary for this stack.
- No UI/design changes beyond toast wording.

## Verification

- After implementation: load a song, click **AI Auto-Sync** on Line Timings → all lines get a `startTime`; word boxes on Word Timings show `+ms` values without any network call.
- Open Generate → Render SD; the encoder loads from the bundled core, frames render, MP4 is produced; preview plays in the Video page on both `id-preview…lovable.app` and the published `karaoke-craft-pro.lovable.app`.
- DevTools Network tab shows zero requests to `unpkg.com` and zero requests to `ai.gateway.lovable.dev` during sync or render.
