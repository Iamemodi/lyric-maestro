import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { formatTime } from "@/components/Waveform";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Download, FileText } from "lucide-react";
import { parseLRC, toLRC } from "@/lib/lrc";
import { toast } from "sonner";

export const Route = createFileRoute("/app/resync")({ component: ResyncPage });

function ResyncPage() {
  const { lines, applyGlobalOffset, resetTimings, title, artist, restoreLines } = useProject();
  const [offset, setOffset] = useState(0);
  const preview = lines.filter((l) => l.startTime != null).slice(0, 6);

  const exportLrc = () => {
    if (!lines.some((l) => l.startTime != null)) return toast.error("No timed lines to export.");
    const text = toLRC(lines, title, artist);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "karaoke"}.lrc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importLrc = async (file: File) => {
    try {
      const text = await file.text();
      const { lines: lrc } = parseLRC(text);
      if (!lrc.length) return toast.error("No timestamps found in .lrc");
      // Map by order: replace text + startTime; preserve voiceId by index when possible.
      const next = lrc.map((l, i) => ({
        id: lines[i]?.id ?? Math.random().toString(36).slice(2, 10),
        text: l.text,
        voiceId: lines[i]?.voiceId ?? null,
        startTime: l.time,
        words: l.words?.length
          ? l.words.map((w) => ({ text: w.text, offset: Math.max(0, (w.time - l.time) * 1000) }))
          : l.text.split(/\s+/).map((w) => ({ text: w, offset: -1 })),
      }));
      restoreLines(next);
      toast.success(`Imported ${next.length} lines from .lrc`);
    } catch {
      toast.error("Could not read .lrc file");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resync</h1>
        <p className="text-sm text-muted-foreground">Shift all line timestamps at once, or import / export .lrc.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportLrc}>
          <Download className="h-4 w-4 mr-1" /> Export .lrc
        </Button>
        <label>
          <input
            type="file"
            className="hidden"
            accept=".lrc,text/plain"
            onChange={(e) => e.target.files?.[0] && importLrc(e.target.files[0])}
          />
          <span className="inline-flex items-center gap-1 text-sm cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-accent">
            <FileText className="h-3 w-3" /> Import .lrc
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Offset</span>
          <span className="tabular-nums font-mono">{offset > 0 ? "+" : ""}{offset.toFixed(2)}s</span>
        </div>
        <Slider min={-5} max={5} step={0.05} value={[offset]} onValueChange={([v]) => setOffset(v)} />
      </div>

      <div className="rounded-lg border border-border p-4 space-y-1">
        <p className="text-xs text-muted-foreground mb-2">Preview (first {preview.length} timed lines)</p>
        {preview.map((l) => (
          <div key={l.id} className="flex justify-between text-sm">
            <span className="truncate flex-1 mr-3">{l.text}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatTime(l.startTime!)} → <span className="text-foreground">{formatTime(Math.max(0, l.startTime! + offset))}</span>
            </span>
          </div>
        ))}
        {!preview.length && <p className="text-sm text-muted-foreground">No timed lines yet.</p>}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => { applyGlobalOffset(offset); setOffset(0); }} disabled={!offset}>Apply offset</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Reset all timings</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all timings?</AlertDialogTitle>
              <AlertDialogDescription>This clears every line and word timestamp. Cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={resetTimings}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/word-timings">Next: Word Timings →</Link></Button>
      </div>
    </div>
  );
}
