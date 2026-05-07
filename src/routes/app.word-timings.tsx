import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { audioEngine, useAudioState } from "@/lib/audio-engine";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, SkipForward } from "lucide-react";

export const Route = createFileRoute("/app/word-timings")({ component: WordTimingsPage });

function WordTimingsPage() {
  const { lines, setWordOffsets, skipWordTimings } = useProject();
  const timed = lines.filter((l) => l.startTime != null);
  const [idx, setIdx] = useState(0);
  const audio = useAudioState();
  const line = timed[idx];
  const [tapped, setTapped] = useState<number[]>([]);

  useEffect(() => {
    setTapped(line ? line.words.map((w) => w.offset).filter((o) => o >= 0) : []);
  }, [line?.id]);

  const startCapture = () => {
    if (!line) return;
    audioEngine.seek(line.startTime!);
    audioEngine.play();
    setTapped([]);
  };

  const tapWord = (i: number) => {
    if (!line) return;
    if (i !== tapped.length) return; // must tap in order
    const offsetMs = (audioEngine.currentTime - line.startTime!) * 1000;
    const next = [...tapped, offsetMs];
    setTapped(next);
    if (next.length === line.words.length) {
      setWordOffsets(line.id, next);
      audioEngine.pause();
      setTimeout(() => setIdx((i) => Math.min(timed.length - 1, i + 1)), 400);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); tapWord(tapped.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!timed.length) {
    return <div className="max-w-2xl mx-auto"><h1 className="text-2xl font-bold mb-2">Word Timings</h1><p className="text-sm text-muted-foreground">Set line timings first.</p></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Word Timings</h1>
          <p className="text-sm text-muted-foreground">Press play, then tap each word as it's sung. <kbd className="px-1 rounded bg-muted">Space</kbd> works too.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm tabular-nums">{idx + 1} / {timed.length}</span>
          <Button size="icon" variant="outline" onClick={() => setIdx((i) => Math.min(timed.length - 1, i + 1))} disabled={idx >= timed.length - 1}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-8 min-h-[260px] flex flex-col items-center justify-center gap-6">
        <div className="flex flex-wrap gap-3 justify-center">
          {line.words.map((w, i) => {
            const reached = i < tapped.length;
            const isNext = i === tapped.length;
            return (
              <button
                key={i}
                onClick={() => tapWord(i)}
                className={
                  "px-4 py-3 rounded-lg text-2xl font-semibold transition-all " +
                  (reached ? "bg-primary text-primary-foreground" : isNext ? "bg-accent text-accent-foreground ring-2 ring-primary" : "bg-muted text-muted-foreground")
                }
              >
                {w.text}
                {reached && <span className="block text-[10px] font-mono opacity-80">+{Math.round(tapped[i])}ms</span>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button onClick={startCapture}>
            {audio.playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {tapped.length ? "Restart capture" : "Play & capture"}
          </Button>
          <Button variant="outline" onClick={() => { skipWordTimings(line.id); setIdx((i) => Math.min(timed.length - 1, i + 1)); }}>
            <SkipForward className="h-4 w-4 mr-1" /> Skip line
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/generate">Next: Generate →</Link></Button>
      </div>
    </div>
  );
}
