import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { audioEngine, useAudioState } from "@/lib/audio-engine";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, SkipForward, Sparkles, Loader2 } from "lucide-react";
import { aiSyncWords } from "@/lib/ai-sync.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/word-timings")({ component: WordTimingsPage });

function WordTimingsPage() {
  const { lines, setWordOffsets, skipWordTimings, audioFile, rawArrayBuffer } = useProject();
  const [aiLoading, setAiLoading] = useState(false);
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

  const runAiWords = async () => {
    if (!timed.length) return toast.error("Set line timings first.");
    if (!rawArrayBuffer && !audioFile) return toast.error("Re-upload audio to use AI sync.");
    const sizeBytes = rawArrayBuffer?.byteLength ?? audioFile?.size ?? 0;
    if (sizeBytes > 20 * 1024 * 1024) return toast.error("Audio is over 20MB — trim or compress before AI sync.");
    setAiLoading(true);
    const tid = toast.loading("AI is aligning words…");
    try {
      const buf = rawArrayBuffer ?? (await audioFile!.arrayBuffer());
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const audioBase64 = btoa(bin);
      const audioMime = audioFile?.type || "audio/mpeg";

      const indexed = lines
        .map((l, i) => ({ line: l, index: i }))
        .filter((x) => x.line.startTime != null);
      const sorted = [...indexed].sort((a, b) => a.line.startTime! - b.line.startTime!);
      const endByIndex = new Map<number, number>();
      for (let i = 0; i < sorted.length; i++) {
        const next = sorted[i + 1]?.line.startTime ?? sorted[i].line.startTime! + 8;
        endByIndex.set(sorted[i].index, next);
      }
      const payloadLines = indexed.map((x) => ({
        index: x.index,
        text: x.line.text,
        startSeconds: x.line.startTime!,
        endSeconds: endByIndex.get(x.index) ?? x.line.startTime! + 8,
      }));
      const { lines: res } = await aiSyncWords({ data: { audioBase64, audioMime, lines: payloadLines } });
      let applied = 0;
      for (const r of res) {
        const target = lines[r.lineIndex];
        if (target && Array.isArray(r.wordOffsetsMs) && r.wordOffsetsMs.length) {
          setWordOffsets(target.id, r.wordOffsetsMs);
          applied++;
        }
      }
      toast.success(`AI aligned words for ${applied} lines.`, { id: tid });
    } catch (e: any) {
      toast.error(e?.message ?? "AI word sync failed", { id: tid });
    } finally {
      setAiLoading(false);
    }
  };

  if (!timed.length) {
    return <div className="max-w-2xl mx-auto"><h1 className="text-2xl font-bold mb-2">Word Timings</h1><p className="text-sm text-muted-foreground">Set line timings first.</p></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Word Timings</h1>
          <p className="text-sm text-muted-foreground">Press play, then tap each word as it's sung. <kbd className="px-1 rounded bg-muted">Space</kbd> works too.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={runAiWords} disabled={aiLoading} variant="secondary" size="sm">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            AI Sync Words
          </Button>
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
