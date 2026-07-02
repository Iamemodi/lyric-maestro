## Fix: Generate step fails to render video

### Root cause
`src/routes/app.generate.tsx` loads the FFmpeg core JS + WASM directly from `unpkg.com` as script/wasm URLs. With our COOP/COEP headers set (and unpkg not sending `Cross-Origin-Resource-Policy`), the browser blocks the load — so `ffmpeg.load()` hangs or throws, and the render never starts. The previous "self-hosted core" approach was reverted last turn to work around the deep-import build error, which traded a build error for a runtime failure.

### Fix
Serve the FFmpeg core from our own origin by copying the two files from `node_modules/@ffmpeg/core/dist/umd/` into `public/ffmpeg/` once, then load them with same-origin URLs. This avoids both the Vite deep-import resolution error (no bundler import at all) and the CORS/COEP block (files come from our own origin with correct headers).

### Steps

1. **Copy core assets into `public/`** (checked into the repo so the build ships them):
   - `public/ffmpeg/ffmpeg-core.js` ← `node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js`
   - `public/ffmpeg/ffmpeg-core.wasm` ← `node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm`

2. **Update `src/routes/app.generate.tsx`**:
   - Replace the unpkg CDN URLs with same-origin paths:
     ```ts
     const coreURL = "/ffmpeg/ffmpeg-core.js";
     const wasmURL = "/ffmpeg/ffmpeg-core.wasm";
     ```
   - Add a `loading…` timeout / clearer error so a future core-load failure surfaces immediately in the UI instead of appearing as a silent hang.
   - Add a small `console.error` on the ffmpeg `log` channel so real encoder errors (bad audio codec, MEMFS OOM, etc.) are visible in DevTools if the failure is downstream of core loading.

3. **Verify** by running the dev server and clicking Render SD — the encoder should load within a few seconds and progress past 0%.

### Notes
- No changes to `vite.config.ts` or `wrangler.jsonc` — COOP/COEP stay as-is; we're just making the core same-origin so those headers don't block it.
- No dependency changes; `@ffmpeg/core` stays installed so future updates can refresh the two files in `public/ffmpeg/`.
