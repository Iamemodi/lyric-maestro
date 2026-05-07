import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { formatTime } from "@/components/Waveform";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/resync")({ component: ResyncPage });

function ResyncPage() {
  const { lines, applyGlobalOffset, resetTimings } = useProject();
  const [offset, setOffset] = useState(0);
  const preview = lines.filter((l) => l.startTime != null).slice(0, 6);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resync</h1>
        <p className="text-sm text-muted-foreground">Shift all line timestamps at once.</p>
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
