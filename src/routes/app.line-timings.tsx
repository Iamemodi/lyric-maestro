import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { audioEngine, useAudioState } from "@/lib/audio-engine";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { formatTime, Waveform } from "@/components/Waveform";
import { Play, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { autoSync } from "@/lib/sync-engine";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/app/line-timings")({ component: LineTimingsPage });

function LineTimingsPage() {
  const { lines, setLineStart, setWordOffsets, voices, audioBuffer, audioUrl } = useProject();
  const [activeIdx, setActiveIdx] = useState(() => lines.findIndex((l) => l.startTime == null));
  const [aiLoading, setAiLoading] = useState(false);
  const audio = useAudioState();
  const listRef = useRef<HTMLDivElement>(null);

  const runAiSync = async () => {
    if (!lines.length) return toast.error("Add lyrics first.");
    if (!audioBuffer) return toast.error("Re-load your audio file from the Upload page first.");
    setAiLoading(true);
    const tid = toast.loading("Analyzing audio…");
    try {
      const { lines: lineRes, words: wordRes } = await autoSync(
        audioBuffer,
        lines.map((l) => l.text),
        (pct, label) => toast.loading(`${label ?? "Analyzing"} ${Math.round(pct)}%`, { id: tid }),
      );
      let applied = 0;
      for (const a of lineRes) {
        const line = lines[a.index];
        if (line && a.startSeconds >= 0) {
          setLineStart(line.id, a.startSeconds);
          applied++;
        }
      }
      let wApplied = 0;
      for (const r of wordRes) {
        const line = lines[r.lineIndex];
        if (line && r.wordOffsetsMs.length) {
          setWordOffsets(line.id, r.wordOffsetsMs);
          wApplied++;
        }
      }
      toast.success(`Synced ${applied} lines and ${wApplied} word tracks.`, { id: tid });
    } catch (e: any) {
      toast.error(e?.message ?? "Auto-sync failed", { id: tid });
    } finally {
      setAiLoading(false);
    }
  };

  const safeIdx = activeIdx < 0 ? 0 : Math.min(activeIdx, lines.length - 1);
  const currentLine = lines[safeIdx];

  const markRef = useRef(() => {});
  markRef.current = () => {
    if (!currentLine) return;
    setLineStart(currentLine.id, audioEngine.currentTime);
    setActiveIdx((i) => Math.min(lines.length - 1, (i < 0 ? 0 : i) + 1));
  };
  const mark = () => markRef.current();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        markRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${safeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [safeIdx]);

  const markers = lines
    .filter((l) => l.startTime != null)
    .map((l) => ({
      time: l.startTime!,
      color: voices.find((v) => v.id === l.voiceId)?.color ?? "#6b7280",
      label: l.text.slice(0, 12),
    }));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Line Timings</h1>
          <p className="text-sm text-muted-foreground">Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Space</kbd> on each line as it starts.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runAiSync} disabled={aiLoading} variant="secondary">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            AI Auto-Sync
          </Button>
          <Button onClick={() => audioEngine.toggle()}>{audio.playing ? "Pause" : "Play"}</Button>
          <Button onClick={mark} variant="default">Mark line ({safeIdx + 1}/{lines.length})</Button>
        </div>
      </div>

      <div ref={listRef} className="rounded-lg border border-border max-h-[60vh] overflow-y-auto divide-y divide-border">
        {lines.map((l, i) => {
          const v = voices.find((vv) => vv.id === l.voiceId);
          const isActive = i === safeIdx;
          return (
            <div
              key={l.id}
              data-idx={i}
              onClick={() => setActiveIdx(i)}
              className={
                "flex items-center gap-3 px-4 py-2 text-sm cursor-pointer " +
                (isActive ? "bg-primary/15" : "hover:bg-accent/30")
              }
              style={isActive && v ? { boxShadow: `inset 4px 0 0 ${v.color}` } : undefined}
            >
              <span className="w-16 tabular-nums text-xs text-muted-foreground">
                {l.startTime != null ? formatTime(l.startTime) : "—"}
              </span>
              <span className={l.startTime == null ? "text-muted-foreground flex-1" : "flex-1"}>{l.text}</span>
              {l.startTime != null && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); audioEngine.seek(l.startTime!); audioEngine.play(); }}
                >
                  <Play className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">Tip: click on the waveform below to set the selected line's exact start time.</p>

      <div className="rounded-lg border border-border overflow-hidden">
        <Waveform
          markers={markers}
          onSeek={(t) => {
            if (currentLine) setLineStart(currentLine.id, t);
            audioEngine.seek(t);
          }}
        />
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/resync">Next: Resync →</Link></Button>
      </div>
    </div>
  );
}
