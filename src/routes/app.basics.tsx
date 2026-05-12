import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { FileText, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { downscaleImageToDataUrl, validateImage, validateLyricsFile } from "@/lib/validation";

export const Route = createFileRoute("/app/basics")({ component: BasicsPage });

function BasicsPage() {
  const { title, artist, setMeta, lines, setLyrics, coverImageDataUrl, setCoverImage, restoreLines } = useProject();

  const saveLyricsWithUndo = (text: string) => {
    const snapshot = lines;
    setLyrics(text);
    toast.success("Lyrics updated", {
      action: {
        label: "Undo",
        onClick: () => restoreLines(snapshot),
      },
      duration: 8000,
    });
  };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(lines.map((l) => l.text).join("\n"));
  const [imgBusy, setImgBusy] = useState(false);

  const onLyricsFile = async (file: File) => {
    const v = validateLyricsFile(file);
    if (!v.ok) return toast.error(v.error);
    try {
      const text = await file.text();
      setDraft(text);
      saveLyricsWithUndo(text);
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error("Could not read lyrics file");
    }
  };

  const onImage = async (file: File) => {
    const v = validateImage(file);
    if (!v.ok) return toast.error(v.error);
    setImgBusy(true);
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      setCoverImage(dataUrl);
      toast.success("Cover image set");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load image");
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Basics</h1>
        <p className="text-sm text-muted-foreground">Confirm song title, artist, lyrics, and cover image.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Song title</Label>
          <Input value={title} onChange={(e) => setMeta(e.target.value, artist)} />
        </div>
        <div className="space-y-2">
          <Label>Artist</Label>
          <Input value={artist} onChange={(e) => setMeta(title, e.target.value)} />
        </div>
      </div>

      {/* Cover image */}
      <div>
        <h2 className="font-semibold mb-3">Cover image (optional)</h2>
        <div className="rounded-lg border border-border p-4 flex items-center gap-4">
          <div className="w-28 h-28 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {coverImageDataUrl ? (
              <img src={coverImageDataUrl} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">JPG, PNG, or GIF · max 10MB. Use it as a video background or intro card in Options.</p>
            <div className="flex gap-2 flex-wrap">
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.gif,image/*"
                  onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])}
                />
                <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-primary/90">
                  {imgBusy ? "Loading…" : coverImageDataUrl ? "Replace image" : "Upload image"}
                </span>
              </label>
              {coverImageDataUrl && (
                <Button variant="outline" size="sm" onClick={() => setCoverImage(null)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold">Lyrics ({lines.length} lines)</h2>
          <div className="flex gap-2">
            <label>
              <input
                type="file"
                className="hidden"
                accept=".txt,text/plain"
                onChange={(e) => e.target.files?.[0] && onLyricsFile(e.target.files[0])}
              />
              <span className="inline-flex items-center gap-1 text-sm cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-accent">
                <FileText className="h-3 w-3" /> Load .txt
              </span>
            </label>
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

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/options">Next: Options →</Link></Button>
      </div>
    </div>
  );
}
