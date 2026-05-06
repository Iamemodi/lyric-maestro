import { createFileRoute } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export const Route = createFileRoute("/app/basics")({ component: BasicsPage });

function BasicsPage() {
  const { title, artist, setMeta, lines, setLyrics } = useProject();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(lines.map((l) => l.text).join("\n"));

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Basics</h1>
        <p className="text-sm text-muted-foreground">Confirm song title, artist, and lyrics.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Song title</Label>
          <Input value={title} onChange={(e) => setMeta(e.target.value, artist)} />
        </div>
        <div className="space-y-2">
          <Label>Artist</Label>
          <Input value={artist} onChange={(e) => setMeta(title, e.target.value)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Lyrics ({lines.length} lines)</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setDraft(lines.map((l) => l.text).join("\n"))}>
                Edit lyrics
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit lyrics</DialogTitle>
              </DialogHeader>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[400px] font-mono text-sm" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => { setLyrics(draft); setOpen(false); }}>Save (resets timings)</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="rounded-lg border border-border divide-y divide-border max-h-[420px] overflow-y-auto">
          {lines.map((l, i) => (
            <div key={l.id} className="px-4 py-2 text-sm flex gap-3">
              <span className="text-muted-foreground tabular-nums w-8 text-right">{i + 1}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
