import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";
import { drawFrame, getCanvasSize } from "@/lib/karaoke-renderer";
import { useCoverImage } from "@/lib/use-cover-image";
import { toast } from "sonner";
// Self-host ffmpeg core so COOP/COEP doesn't block cross-origin loads.
// JS lives in /public; wasm is CDN-hosted (too big for repo) but served
// from our own origin under /__l5e/ so it's same-origin to the browser.
import wasmAsset from "../../public/ffmpeg/ffmpeg-core.wasm.asset.json";
const coreURL = "/ffmpeg/ffmpeg-core.js";
const wasmURL = wasmAsset.url;

export const Route = createFileRoute("/app/generate")({ component: GeneratePage });

const CHUNK_FRAMES = 300; // ~10s @30fps — keeps MEMFS bounded.

function GeneratePage() {
  const { options, lines, voices, title, artist, audioFile, duration, setGenerated } = useProject();
  const coverImage = useCoverImage();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "rendering" | "encoding" | "done" | "error">("idle");
  const [eta, setEta] = useState<string>("");
  const [showPreview, setShowPreview] = useState(true);
  const cancelRef = useRef(false);
  const ffmpegRef = useRef<any>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  const timedLines = lines.filter((l) => l.startTime != null);
  const lastStart = timedLines.length > 0 ? Math.max(...timedLines.map((l) => l.startTime!)) : 0;
  const totalDuration = Math.max(duration > 0 ? duration : 0, lastStart + 5) + options.outroSeconds;

  useEffect(() => () => {
    // terminate ffmpeg if user navigates away mid-render
    try { ffmpegRef.current?.terminate(); } catch {}
  }, []);

  const start = async (hd = false) => {
    if (!audioFile) return toast.error("No audio loaded — re-upload it from the Upload page.");
    cancelRef.current = false;
    setStatus("loading");
    setProgress(0);
    setEta("");

    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      let lastLog = "";
      ffmpeg.on("log", ({ message }) => { lastLog = message; });

      // Self-hosted single-threaded core (no SharedArrayBuffer needed, browser-cached after first load).
      await ffmpeg.load({ coreURL, wasmURL });

      setStatus("rendering");
      const fps = 30;
      const { w, h } = getCanvasSize(options.aspectRatio);
      const targetW = hd ? (options.aspectRatio === "16:9" ? 1920 : 1440) : w;
      const targetH = hd ? 1080 : h;
      const scale = targetW / w;

      const canvas = previewRef.current ?? document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;

      const dur = Math.max(1, totalDuration);
      const totalFrames = Math.ceil(dur * fps);
      const numChunks = Math.ceil(totalFrames / CHUNK_FRAMES);
      const t0 = performance.now();
      const segNames: string[] = [];

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

          const blob: Blob = await new Promise((res) =>
            canvas.toBlob((b) => res(b!), "image/jpeg", hd ? 0.9 : 0.82)!,
          );
          const buf = new Uint8Array(await blob.arrayBuffer());
          const name = `f_${String(f - fStart).padStart(5, "0")}.jpg`;
          await ffmpeg.writeFile(name, buf);
          written.push(name);

          // Yield each frame so the cancel button stays responsive.
          if ((f & 1) === 0) await new Promise((r) => setTimeout(r, 0));

          const renderedTotal = f + 1;
          const p = (renderedTotal / totalFrames) * 0.7;
          setProgress(p * 100);
          if (renderedTotal % 10 === 0) {
            const elapsed = (performance.now() - t0) / 1000;
            const rate = renderedTotal / elapsed;
            const remain = Math.max(0, (totalFrames - renderedTotal) / rate);
            setEta(`${Math.ceil(remain)}s remaining`);
          }
        }

        // Encode this chunk to a video-only segment, then free the JPGs immediately.
        const segName = `seg_${String(ci).padStart(3, "0")}.mp4`;
        await ffmpeg.exec([
          "-framerate", String(fps),
          "-i", "f_%05d.jpg",
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "ultrafast",
          "-crf", hd ? "20" : "26",
          "-an",
          segName,
        ]);
        segNames.push(segName);
        for (const n of written) {
          try { await ffmpeg.deleteFile(n); } catch {}
        }
      }

      setStatus("encoding");
      setEta("muxing audio…");

      // Concat segments + mux audio in one final pass.
      const concatList = segNames.map((n) => `file '${n}'`).join("\n");
      await ffmpeg.writeFile("list.txt", new TextEncoder().encode(concatList));
      const audioName = "audio" + (audioFile.name.match(/\.[^.]+$/)?.[0] ?? ".mp3");
      await ffmpeg.writeFile(audioName, await fetchFile(audioFile));

      ffmpeg.on("progress", ({ progress: p }) => {
        if (cancelRef.current) return;
        setProgress(70 + Math.min(30, p * 30));
      });

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
      const url = URL.createObjectURL(blob);

      // Best-effort cleanup; non-blocking.
      (async () => {
        try {
          for (const n of segNames) await ffmpeg.deleteFile(n).catch(() => {});
          await ffmpeg.deleteFile(audioName).catch(() => {});
          await ffmpeg.deleteFile("list.txt").catch(() => {});
          await ffmpeg.deleteFile("out.mp4").catch(() => {});
        } catch {}
      })();

      setGenerated(url, hd);
      setProgress(100);
      setStatus("done");
      toast.success("Video ready!");
      setTimeout(() => navigate({ to: "/app/video" }), 600);
    } catch (e: any) {
      if (cancelRef.current) {
        setStatus("idle");
        toast("Cancelled");
      } else {
        console.error(e);
        setStatus("error");
        toast.error("Generation failed: " + (e?.message ?? "unknown"));
      }
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    try { ffmpegRef.current?.terminate(); } catch {}
  };

  const { w: cw, h: ch } = getCanvasSize(options.aspectRatio);
  const aspectStyle = { aspectRatio: `${cw} / ${ch}` };

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
              Render HD video (1080p) — slower
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              HD takes significantly longer to encode in-browser.
            </p>
          </div>
        )}

        {status !== "idle" && status !== "done" && status !== "error" && (
          <div className="space-y-3">
            <Progress value={progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{status === "loading" ? "Loading encoder…" : status === "rendering" ? "Rendering frames…" : "Muxing audio + video…"}</span>
              <span>{Math.round(progress)}% · {eta}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
                {showPreview ? "Hide preview" : "Show preview"}
              </Button>
            </div>
            {showPreview && (
              <div className="rounded-lg border border-border bg-black overflow-hidden" style={aspectStyle}>
                <canvas ref={previewRef} className="w-full h-full block" />
              </div>
            )}
          </div>
        )}

        {status === "error" && (
          <Button onClick={() => start(false)}>Retry</Button>
        )}
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/video">Next: Video →</Link></Button>
      </div>
    </div>
  );
}
