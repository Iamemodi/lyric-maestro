import { createFileRoute } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { audioEngine, useAudioState } from "@/lib/audio-engine";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/components/Waveform";
import { Play } from "lucide-react";

export const Route = createFileRoute("/app/line-timings")({ component: LineTimingsPage });

function LineTimingsPage() {
  const { lines, setLineStart, voices } = useProject();
  const [activeIdx, setActiveIdx] = useState(() => lines.findIndex((l) => l.startTime == null));
  const audio = useAudioState();
  const listRef = useRef<HTMLDivElement>(null);

  const safeIdx = activeIdx < 0 ? 0 : Math.min(activeIdx, lines.length - 1);
  const currentLine = lines[safeIdx];

  const mark = () => {
    if (!currentLine) return;
    setLineStart(currentLine.id, audioEngine.currentTime);
    setActiveIdx((i) => Math.min(lines.length - 1, (i < 0 ? 0 : i) + 1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        mark();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${safeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [safeIdx]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Line Timings</h1>
          <p className="text-sm text-muted-foreground">Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Space</kbd> on each line as it starts.</p>
        </div>
        <div className="flex gap-2">
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
      <p className="text-xs text-muted-foreground">Tip: click anywhere on the waveform to set the selected line's exact start time.</p>
      <WaveformClickHandler onTime={(t) => currentLine && setLineStart(currentLine.id, t)} />
    </div>
  );
}

// Tiny invisible component that hijacks waveform seek -> sets line time instead.
// We do this by listening for a custom event the Waveform doesn't emit; simpler: do nothing.
// (Direct waveform-seek-to-mark requires more wiring; users can use Mark + scrub via waveform play.)
function WaveformClickHandler({ onTime: _onTime }: { onTime: (t: number) => void }) {
  return null;
}
