# Mellow — Karaoke Video Studio

Make a karaoke MP4 from any audio file, **100% in your browser**. No accounts, no servers, no uploads — your audio never leaves your device.

## Features

- **Audio input** — MP3, WAV, M4A, FLAC, OGG, MP4 up to 100 MB
- **Lyrics** — paste, upload `.txt`, or import existing `.lrc` files
- **AI Auto-Sync** — local audio analysis (no cloud) detects line and word onsets
- **Tap-sync** — `Space` to mark each line as it plays; per-word capture
- **Live preview** — canvas renderer with multi-voice color/title modes, cover image background or intro card
- **Export** — MP4 video (SD 720p / HD 1080p) and `.lrc` lyrics file
- **Privacy** — everything (decode, analysis, render, FFmpeg encoding) runs locally via WebAssembly

## Local development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # production build
bun run preview  # serve the production build
```

## Tech stack

- **TanStack Start** v1 (React 19, file-based routing)
- **Vite 7** + Tailwind CSS v4
- **Zustand** for project state (persisted to localStorage)
- **@ffmpeg/ffmpeg** + `@ffmpeg/core` (single-threaded WASM, self-hosted)
- **Web Audio API** for decoding, analysis and playback
- Deployed on **Cloudflare Workers** via `@cloudflare/vite-plugin`

## Browser support

Chromium-based browsers and Firefox 100+ work best. Safari may stutter during long FFmpeg encodes due to WASM memory limits.

## Privacy

All processing happens client-side. No telemetry, no analytics, no third-party uploads. The only outbound network requests are the initial bundle download and (optional) Lovable preview UI.
