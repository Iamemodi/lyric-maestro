## Fix video generation + robust cancel, live logs, HD fallback

### Root cause of current failure
`app.generate.tsx` loads `wasmURL` from a hardcoded `/__l5e/assets-v1/...` asset URL. That path is a build-time artifact identifier — it is not guaranteed to resolve at runtime (especially on published builds or after asset re-upload), so `ffmpeg.load()` hangs or 404s and the render never starts. It also violates the same-origin/self-host strategy the plan file describes.

### Fix strategy
Serve both FFmpeg core files from `/public/ffmpeg/` (same-origin, same headers as the app) and harden the render loop with real cancel, live logs, and an HD→SD fallback.

### Changes

1. **Self-host the wasm** (`public/ffmpeg/ffmpeg-core.wasm`)
   - Ship the wasm alongside the already-present `ffmpeg-core.js` so both load from `/ffmpeg/*` on our origin.
   - Update `src/routes/app.generate.tsx`:
     ```ts
     const coreURL = "/ffmpeg/ffmpeg-core.js";
     const wasmURL = "/ffmpeg/ffmpeg-core.wasm";
     ```
   - Add a 20s timeout around `ffmpeg.load()` that rejects with a clear "encoder failed to load" error so a bad path surfaces instead of hanging.

2. **Real cancel button**
   - Keep `cancelRef` for cooperative aborts inside the frame loop, but on click also call `ffmpeg.terminate()` immediately, then null `ffmpegRef.current`. Terminating kills the worker and frees MEMFS + the wasm heap in one shot (no need to `deleteFile` each JPG).
   - Wrap the outer try in a `finally` that, when not cancelled, best-effort deletes segment/audio/list/out files; when cancelled, calls `terminate()` unconditionally.
   - Disable Cancel while `status === "loading"` until the FFmpeg instance exists, then enable — prevents a null-terminate race.

3. **Live progress + log panel**
   - Add `logs: string[]` state (ring-buffered to last ~120 lines).
   - In `ffmpeg.on("log", ...)`, push `message` into state (throttled via `requestAnimationFrame` to avoid re-render storms).
   - Render a collapsible `<pre>` under the progress bar with auto-scroll to bottom, monospace, `max-h-48 overflow-auto`.
   - Keep the existing % + ETA line; also show current phase ("Loading encoder", "Rendering frames X/Y", "Encoding segment N/M", "Muxing audio") derived from loop indices rather than only the ffmpeg progress event, so users see motion during frame rasterization too.

4. **HD fallback pipeline**
   - Extract the current render body into `runRender({ width, height, crf, preset, videoBitrate? })`.
   - `start(hd)` builds a tier list:
     - HD attempt: `1920×1080 (or 1440×1080 for 4:3), crf 20, preset ultrafast`
     - Fallback 1 (auto on HD failure): `1280×720, crf 23, preset ultrafast`
     - Fallback 2 (auto if 720p also fails): `960×540, crf 26, preset ultrafast, -maxrate 2M -bufsize 4M`
     - SD button uses only the 720p + 540p tiers.
   - On thrown error that is NOT a user cancel, log the failure to the on-screen log panel, toast `"HD render failed — retrying at 720p"`, terminate the current ffmpeg, spin up a fresh instance, and run the next tier. Only surface a hard error once all tiers fail.
   - Track which tier succeeded and pass it to `setGenerated(url, tier)` so the Video page can show "Rendered at 720p (HD fallback)".

5. **Small robustness fixes uncovered while doing the above**
   - Move `ffmpeg.on("progress", …)` registration BEFORE the first `exec` (currently it's only registered right before the mux pass, so segment encodes contribute no progress).
   - Guard `previewRef.current` — if the preview is hidden the ref is null, so always fall back to an offscreen canvas and only `drawImage` onto the visible one when it exists. Prevents "cannot read properties of null" when a user toggles Hide preview.
   - Free the JPEG blob URL variable each iteration (already using `arrayBuffer()`, but ensure the `Blob` reference goes out of scope by not retaining it beyond the write).

### Files touched
- `public/ffmpeg/ffmpeg-core.wasm` — new (copied from `node_modules/@ffmpeg/core/dist/umd/`).
- `src/routes/app.generate.tsx` — cancel, logs, tiered fallback, progress registration, wasmURL fix.
- `src/store/project.ts` — extend `setGenerated` signature to accept an optional tier label (used by Video page copy).
- `src/routes/app.video.tsx` — surface tier label when present. (No behavior change if absent.)

### Out of scope
- No changes to `karaoke-renderer`, sync engine, or other routes.
- No dependency changes; `@ffmpeg/core` is already installed and the wasm is copied from it at build time.
