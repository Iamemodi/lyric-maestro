import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useRef, useState } from "react";
import { drawFrame, getCanvasSize } from "@/lib/karaoke-renderer";
import { toast } from "sonner";

export const Route = createFileRoute("/app/generate")({ component: GeneratePage });

function GeneratePage() {
  const { options, lines, voices, title, artist, audioFile, duration, setGenerated } = useProject();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "rendering" | "encoding" | "done" | "error">("idle");
  const [eta, setEta] = useState<string>("");
  const cancelRef = useRef(false);
  const ffmpegRef = useRef<any>(null);
  const navigate = useNavigate();

  const totalDuration = (lines.find((l) => l.startTime != null)?.startTime ?? 0) > 0
    ? Math.max(duration, (Math.max(...lines.map((l) => l.startTime ?? 0))) + 5) + options.outroSeconds
    : duration;

  const start = async (hd = false) => {
    if (!audioFile) return toast.error("No audio");
    cancelRef.current = false;
    setStatus("loading");
    setProgress(0);

    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setStatus("rendering");
      const fps = 30;
      const { w, h } = getCanvasSize(options.aspectRatio);
      const targetW = hd ? (options.aspectRatio === "16:9" ? 1920 : 1440) : w;
      const targetH = hd ? 1080 : h;
      const scale = targetW / w;

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);

      const dur = Math.max(1, totalDuration);
      const totalFrames = Math.ceil(dur * fps);

      const t0 = performance.now();
      for (let f = 0; f < totalFrames; f++) {
        if (cancelRef.current) throw new Error("cancelled");
        const t = f / fps;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawFrame(ctx, { options, lines, voices, time: t, title, artist, width: w, height: h });

        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85)!);
        const buf = new Uint8Array(await blob.arrayBuffer());
        const name = `f_${String(f).padStart(5, "0")}.jpg`;
        await ffmpeg.writeFile(name, buf);

        if (f % 5 === 0) {
          const p = (f / totalFrames) * 0.7;
          setProgress(p * 100);
          const elapsed = (performance.now() - t0) / 1000;
          const rate = (f + 1) / elapsed;
          const remain = Math.max(0, (totalFrames - f) / rate);
          setEta(`${Math.ceil(remain)}s remaining`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setStatus("encoding");
      setEta("encoding…");
      const audioName = "audio" + (audioFile.name.match(/\.[^.]+$/)?.[0] ?? ".mp3");
      await ffmpeg.writeFile(audioName, await fetchFile(audioFile));

      ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(70 + Math.min(30, p * 30));
      });

      await ffmpeg.exec([
        "-framerate", String(fps),
        "-i", "f_%05d.jpg",
        "-i", audioName,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-crf", hd ? "20" : "26",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "out.mp4",
      ]);

      const data = await ffmpeg.readFile("out.mp4");
      const dataU8 = data as Uint8Array;
      const blob = new Blob([dataU8.buffer.slice(dataU8.byteOffset, dataU8.byteOffset + dataU8.byteLength) as ArrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setGenerated(url, hd);
      setProgress(100);
      setStatus("done");
      toast.success("Video ready!");
      setTimeout(() => navigate({ to: "/app/video" }), 600);
    } catch (e: any) {
      if (e.message === "cancelled") {
        setStatus("idle");
        toast("Cancelled");
      } else {
        console.error(e);
        setStatus("error");
        toast.error("Generation failed: " + e.message);
      }
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    try { ffmpegRef.current?.terminate(); } catch {}
  };

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
          <Button onClick={() => start(false)} size="lg" className="w-full">Render SD video (720p)</Button>
        )}

        {status !== "idle" && status !== "done" && status !== "error" && (
          <div className="space-y-2">
            <Progress value={progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{status === "loading" ? "Loading encoder…" : status === "rendering" ? "Rendering frames…" : "Muxing audio + video…"}</span>
              <span>{Math.round(progress)}% · {eta}</span>
            </div>
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        )}

        {status === "error" && (
          <Button onClick={() => start(false)}>Retry</Button>
        )}
      </div>
    </div>
  );
}
