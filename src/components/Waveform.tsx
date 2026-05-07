import { useEffect, useRef, useState } from "react";
import { useProject } from "@/store/project";
import { audioEngine, useAudioState } from "@/lib/audio-engine";
import { Button } from "@/components/ui/button";
import { Pause, Play, ZoomIn, ZoomOut } from "lucide-react";

export interface Marker {
  time: number;
  color: string;
  label?: string;
}

interface Props {
  markers?: Marker[];
  onSeek?: (time: number) => void;
  height?: number;
}

export function Waveform({ markers = [], onSeek, height = 96 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { peaks, duration, audioUrl } = useProject();
  const { time, playing } = useAudioState();
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [isLight, setIsLight] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("light"),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains("light"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const drawW = width * zoom;
    canvas.width = drawW * dpr;
    canvas.height = height * dpr;
    canvas.style.width = drawW + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawW, height);

    const playedX = duration > 0 ? (time / duration) * drawW : 0;
    const isLight = document.documentElement.classList.contains("light");
    const played = "#8b5cf6";
    const unplayed = isLight ? "#d4d4d8" : "#3f3f46";

    const bars = peaks.length;
    const barW = drawW / bars;
    const mid = height / 2;
    for (let i = 0; i < bars; i++) {
      const x = i * barW;
      const h = peaks[i] * (height * 0.9);
      ctx.fillStyle = x < playedX ? played : unplayed;
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }

    // markers
    for (const m of markers) {
      const mx = (m.time / duration) * drawW;
      ctx.fillStyle = m.color;
      ctx.fillRect(mx - 1, 0, 2, height);
    }

    // playhead
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(playedX - 1, 0, 2, height);
  }, [peaks, time, duration, width, zoom, height, markers]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!duration) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * duration;
    if (onSeek) onSeek(t);
    else audioEngine.seek(t);
  };

  if (!audioUrl) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-muted-foreground border-t border-border">
        No audio loaded
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card/50 p-2">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => audioEngine.toggle()}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden" style={{ height }}>
          <canvas ref={ref} onClick={handleClick} className="cursor-pointer" />
        </div>
        <div className="flex flex-col gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground w-24 text-right">
          {formatTime(time)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}

export function formatTime(t: number) {
  if (!isFinite(t)) return "0:00.0";
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}
