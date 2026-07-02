import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";
import { drawFrame, getCanvasSize } from "@/lib/karaoke-renderer";
import { useCoverImage } from "@/lib/use-cover-image";
import { toast } from "sonner";
import wasmAsset from "../../public/ffmpeg/ffmpeg-core.wasm.asset.json";

// Self-hosted single-threaded core. JS ships in /public; wasm is served
// same-origin via /__l5e/assets-v1/... so COOP/COEP does not block it.
const coreURL = "/ffmpeg/ffmpeg-core.js";
const wasmURL = wasmAsset.url;

export const Route = createFileRoute("/app/generate")({ component: GeneratePage });

const CHUNK_FRAMES = 300; // ~10s @30fps — keeps MEMFS bounded.
const LOG_LIMIT = 120;

interface Tier {
  label: string;
  width: number;
  height: number;
  crf: string;
  preset: string;
  maxrate?: string;
  bufsize?: string;
}

function buildTiers(hd: boolean, aspect: "16:9" | "4:3"): Tier[] {
  const hdW = aspect === "16:9" ? 1920 : 1440;
  const sdW = aspect === "16:9" ? 1280 : 960;
  const lowW = aspect === "16:9" ? 960 : 720;
  const tiers: Tier[] = [];
  if (hd) tiers.push({ label: "1080p", width: hdW, height: 1080, crf: "20", preset: "ultrafast" });
  tiers.push({ label: "720p", width: sdW, height: 720, crf: "23", preset: "ultrafast" });
  tiers.push({ label: "540p", width: lowW, height: 540, crf: "26", preset: "ultrafast", maxrate: "2M", bufsize: "4M" });
  return tiers;
}

function GeneratePage() {
  const { options, lines, voices, title, artist, audioFile, duration, setGenerated } = useProject();
  const coverImage = useCoverImage();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "rendering" | "encoding" | "done" | "error">("idle");
  const [phase, setPhase] = useState<string>("");
  const [eta, setEta] = useState<string>("");
  const [showPreview, setShowPreview] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const ffmpegRef = useRef<any>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const logBufRef = useRef<string[]>([]);
  const logRafRef = useRef<number | null>(null);
  const logPreRef = useRef<HTMLPreElement>(null);
  const navigate = useNavigate();

  const timedLines = lines.filter((l) => l.startTime != null);
  const lastStart = timedLines.length > 0 ? Math.max(...timedLines.map((l) => l.startTime!)) : 0;
  const totalDuration = Math.max(duration > 0 ? duration : 0, lastStart + 5) + options.outroSeconds;

  useEffect(() => () => {
    try { ffmpegRef.current?.terminate(); } catch {}
  }, []);

  const pushLog = (msg: string) => {
    logBufRef.current.push(msg);
    if (logBufRef.current.length > LOG_LIMIT) logBufRef.current = logBufRef.current.slice(-LOG_LIMIT);
    if (logRafRef.current == null) {
      logRafRef.current = requestAnimationFrame(() => {
        logRafRef.current = null;
        setLogs([...logBufRef.current]);
        const el = logPreRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  };

  const runRender = async (tier: Tier): Promise<Blob> => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { fetchFile } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;
    ffmpeg.on("log", ({ message }: { message: string }) => pushLog(message));

    setPhase("Loading encoder…");
    pushLog(`[tier ${tier.label}] loading ffmpeg core…`);
    await Promise.race([
      ffmpeg.load({ coreURL, wasmURL }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("encoder load timed out")), 30000)),
    ]);
    if (cancelRef.current) throw new Error("cancelled");

    const fps = 30;
    const { w, h } = getCanvasSize(options.aspectRatio);
    const targetW = tier.width;
    const targetH = tier.height;
    const scale = targetW / w;

    // Offscreen render canvas — the visible preview is drawn separately.
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = targetW;
    renderCanvas.height = targetH;
    const ctx = renderCanvas.getContext("2d")!;

    const previewCanvas = previewRef.current;
    const previewCtx = previewCanvas?.getContext("2d") ?? null;
    if (previewCanvas) {
      previewCanvas.width = targetW;
      previewCanvas.height = targetH;
    }

    const dur = Math.max(1, totalDuration);
    const totalFrames = Math.ceil(dur * fps);
    const numChunks = Math.ceil(totalFrames / CHUNK_FRAMES);
    const t0 = performance.now();
    const segNames: string[] = [];

    ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
      if (cancelRef.current) return;
      // Encoding progress contributes only after frame rendering completes.
      const clamped = Math.max(0, Math.min(1, p));
      setProgress((cur) => Math.max(cur, 70 + clamped * 30));
    });

    setPhase(`Rendering frames (${tier.label})…`);
    for (let ci = 0; ci < numChunks; ci++) {
      if (cancelRef.current) throw new Error("cancelled");
      const fStart = ci * CHUNK_FRAMES;
      const fEnd = Math.min(totalFrames, fStart + CHUNK_FRAMES);
      const written: string[] = [];

      for (let f = fStart; f < fEnd; f++) {
        if (cancelRef.current) throw new Error("cancelled");
        const t = f / fps;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawFrame(ctx, { options, lines, voices, time: t, title, artist, width: w, height: h, coverImage });

        if (previewCtx && (f & 3) === 0) {
          previewCtx.drawImage(renderCanvas, 0, 0);
        }

        const blob: Blob = await new Promise((res) =>
          renderCanvas.toBlob((b) => res(b!), "image/jpeg", tier.label === "1080p" ? 0.9 : 0.82)!,
        );
        const buf = new Uint8Array(await blob.arrayBuffer());
        const name = `f_${String(f - fStart).padStart(5, "0")}.jpg`;
        await ffmpeg.writeFile(name, buf);
        written.push(name);

        if ((f & 1) === 0) await new Promise((r) => setTimeout(r, 0));

        const renderedTotal = f + 1;
        const p = (renderedTotal / totalFrames) * 0.7;
        setProgress(p * 100);
        if (renderedTotal % 15 === 0) {
          const elapsed = (performance.now() - t0) / 1000;
          const rate = renderedTotal / elapsed;
          const remain = Math.max(0, (totalFrames - renderedTotal) / rate);
          setEta(`${Math.ceil(remain)}s remaining`);
          setPhase(`Rendering frames ${renderedTotal}/${totalFrames} (${tier.label})`);
        }
      }

      if (cancelRef.current) throw new Error("cancelled");
      setPhase(`Encoding segment ${ci + 1}/${numChunks}`);
      const segName = `seg_${String(ci).padStart(3, "0")}.mp4`;
      const args = [
        "-framerate", String(fps),
        "-i", "f_%05d.jpg",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", tier.preset,
        "-crf", tier.crf,
      ];
      if (tier.maxrate) args.push("-maxrate", tier.maxrate);
      if (tier.bufsize) args.push("-bufsize", tier.bufsize);
      args.push("-an", segName);
      await ffmpeg.exec(args);
      segNames.push(segName);
      for (const n of written) {
        try { await ffmpeg.deleteFile(n); } catch {}
      }
    }

    if (cancelRef.current) throw new Error("cancelled");
    setPhase("Muxing audio + video…");
    setEta("");

    const concatList = segNames.map((n) => `file '${n}'`).join("\n");
    await ffmpeg.writeFile("list.txt", new TextEncoder().encode(concatList));
    const audioName = "audio" + (audioFile!.name.match(/\.[^.]+$/)?.[0] ?? ".mp3");
    await ffmpeg.writeFile(audioName, await fetchFile(audioFile!));

    await ffmpeg.exec([
      "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-i", audioName,
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-shortest",
      "out.mp4",
    ]);

    const data = await ffmpeg.readFile("out.mp4");
    const dataU8 = data as Uint8Array;
    const blob = new Blob(
      [dataU8.buffer.slice(dataU8.byteOffset, dataU8.byteOffset + dataU8.byteLength) as ArrayBuffer],
      { type: "video/mp4" },
    );

    // Best-effort MEMFS cleanup; the terminate() below frees everything anyway.
    try {
      for (const n of segNames) await ffmpeg.deleteFile(n).catch(() => {});
      await ffmpeg.deleteFile(audioName).catch(() => {});
      await ffmpeg.deleteFile("list.txt").catch(() => {});
      await ffmpeg.deleteFile("out.mp4").catch(() => {});
    } catch {}

    try { ffmpeg.terminate(); } catch {}
    ffmpegRef.current = null;
    return blob;
  };

  const start = async (hd = false) => {
    if (!audioFile) return toast.error("No audio loaded — re-upload it from the Upload page.");
    cancelRef.current = false;
    setStatus("loading");
    setProgress(0);
    setPhase("");
    setEta("");
    logBufRef.current = [];
    setLogs([]);

    const tiers = buildTiers(hd, options.aspectRatio);
    let lastErr: any = null;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      try {
        setStatus(i === 0 && hd ? "rendering" : "rendering");
        pushLog(`▶ starting tier ${tier.label} (${tier.width}×${tier.height})`);
        const blob = await runRender(tier);
        if (cancelRef.current) throw new Error("cancelled");
        const url = URL.createObjectURL(blob);
        setGenerated(url, tier.label === "1080p", tier.label + (i > 0 ? " (fallback)" : ""));
        setProgress(100);
        setStatus("done");
        toast.success(`Video ready (${tier.label})`);
        setTimeout(() => navigate({ to: "/app/video" }), 500);
        return;
      } catch (e: any) {
        lastErr = e;
        try { ffmpegRef.current?.terminate(); } catch {}
        ffmpegRef.current = null;
        if (cancelRef.current) {
          setStatus("idle");
          toast("Cancelled");
          return;
        }
        pushLog(`✖ tier ${tier.label} failed: ${e?.message ?? e}`);
        if (i < tiers.length - 1) {
          const next = tiers[i + 1];
          toast.error(`${tier.label} failed — retrying at ${next.label}`);
          setProgress(0);
          setEta("");
          continue;
        }
      }
    }

    console.error(lastErr);
    setStatus("error");
    toast.error("Generation failed: " + (lastErr?.message ?? "unknown"));
  };

  const cancel = () => {
    cancelRef.current = true;
    try { ffmpegRef.current?.terminate(); } catch {}
    ffmpegRef.current = null;
    setPhase("Cancelling…");
  };

  const { w: cw, h: ch } = getCanvasSize(options.aspectRatio);
  const aspectStyle = { aspectRatio: `${cw} / ${ch}` };
  const active = status !== "idle" && status !== "done" && status !== "error";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generate</h1>
        <p className="text-sm text-muted-foreground">Render the karaoke video in your browser. Nothing is uploaded.</p>
      </div>

      <div className="rounded-xl border border-border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Lines:</span> {lines.length}</div>
          <div><span className="text-muted-foreground">Timed:</span> {lines.filter((l) => l.startTime != null).length}</div>
          <div><span className="text-muted-foreground">Aspect:</span> {options.aspectRatio}</div>
          <div><span className="text-muted-foreground">Duration:</span> {Math.round(totalDuration)}s</div>
        </div>

        {status === "idle" && (
          <div className="space-y-2">
            <Button onClick={() => start(false)} size="lg" className="w-full">Render SD video (720p)</Button>
            <Button onClick={() => start(true)} size="lg" variant="outline" className="w-full">
              Render HD video (1080p) — auto-falls back if it fails
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              HD encodes slower in-browser. On failure we automatically retry at 720p, then 540p.
            </p>
          </div>
        )}

        {active && (
          <div className="space-y-3">
            <Progress value={progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{phase || "Working…"}</span>
              <span>{Math.round(progress)}%{eta ? ` · ${eta}` : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={cancel} disabled={!ffmpegRef.current && status === "loading"}>
                Cancel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
                {showPreview ? "Hide preview" : "Show preview"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowLogs((s) => !s)}>
                {showLogs ? "Hide logs" : "Show logs"}
              </Button>
            </div>
            {showPreview && (
              <div className="rounded-lg border border-border bg-black overflow-hidden" style={aspectStyle}>
                <canvas ref={previewRef} className="w-full h-full block" />
              </div>
            )}
            {showLogs && (
              <pre
                ref={logPreRef}
                className="text-[10px] leading-tight font-mono bg-black/50 border border-border rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap"
              >
                {logs.join("\n") || "…"}
              </pre>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Rendering failed after trying all quality tiers.</p>
            <div className="flex gap-2">
              <Button onClick={() => start(false)}>Retry SD</Button>
              <Button variant="outline" onClick={() => setShowLogs(true)}>Show logs</Button>
            </div>
            {showLogs && (
              <pre
                ref={logPreRef}
                className="text-[10px] leading-tight font-mono bg-black/50 border border-border rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap"
              >
                {logs.join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/video">Next: Video →</Link></Button>
      </div>
    </div>
  );
}
