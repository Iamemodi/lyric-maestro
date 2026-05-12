import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AudioWaveform, FileText, Upload } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { audioEngine } from "@/lib/audio-engine";
import { toast } from "sonner";
import { validateAudio, validateLyricsFile } from "@/lib/validation";
import { parseLRC } from "@/lib/lrc";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MELLOW — Karaoke Video Creator" },
      { name: "description", content: "Turn any song into a karaoke video, 100% in your browser." },
      { property: "og:title", content: "MELLOW — Karaoke Video Creator" },
      { property: "og:description", content: "Upload audio, sync lyrics, export an MP4. No accounts, no servers." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const { audioFile, loadFile, setMeta, setLyrics, title, artist, loadProgress } = useProject();
  const [t, setT] = useState(title);
  const [a, setA] = useState(artist);
  const [lyrics, setLyricsLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const onFile = useCallback(async (file: File) => {
    const v = validateAudio(file);
    if (!v.ok) return toast.error(v.error);
    setBusy(true);
    try {
      await loadFile(file);
      const url = useProject.getState().audioUrl;
      if (url) audioEngine.setSource(url);
      toast.success(`Loaded ${file.name}`);
    } catch (e) {
      toast.error("Failed to load file");
    } finally {
      setBusy(false);
    }
  }, [loadFile]);

  const onLyricsFile = async (file: File) => {
    const v = validateLyricsFile(file);
    if (!v.ok) return toast.error(v.error);
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".lrc")) {
        const { lines: lrcLines, title: lt, artist: la } = parseLRC(text);
        if (!lrcLines.length) return toast.error("No timestamps found in .lrc");
        setLyricsLocal(lrcLines.map((l) => l.text).join("\n"));
        if (lt && !t) setT(lt);
        if (la && !a) setA(la);
        toast.success(`Loaded ${lrcLines.length} lines from .lrc`);
      } else {
        setLyricsLocal(text);
        toast.success(`Loaded ${file.name}`);
      }
    } catch {
      toast.error("Could not read lyrics file");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const submit = () => {
    if (!audioFile) return toast.error("Please upload an audio file");
    if (!lyrics.trim()) return toast.error("Please paste lyrics");
    setMeta(t || audioFile.name.replace(/\.[^.]+$/, ""), a);
    setLyrics(lyrics);
    navigate({ to: "/app/basics" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AudioWaveform className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold tracking-wide">MELLOW</h1>
          <span className="text-xs text-muted-foreground ml-2 uppercase tracking-wider">Karaoke Studio</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 px-6 py-10 max-w-7xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold mb-3">Make a karaoke video from any song</h2>
          <p className="text-muted-foreground">Upload audio, paste lyrics, sync, export. All in your browser.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* File picker */}
          <section
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={"rounded-xl border-2 border-dashed p-6 transition-colors " + (drag ? "border-primary bg-primary/5" : "border-border")}
          >
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 min-h-[220px] sm:min-h-[260px]">
              <Upload className="h-10 w-10 text-primary" />
              <div>
                <p className="font-medium">Drop your audio or video</p>
                <p className="text-xs text-muted-foreground">MP3, WAV, M4A, FLAC, OGG, MP4 · max 100MB</p>
              </div>
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept=".mp3,.m4a,.mp4,.wav,.ogg,.flac,audio/*,video/*"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-pointer hover:bg-primary/90">
                  {busy ? "Loading…" : "Browse"}
                </span>
              </label>
              {busy && (
                <div className="w-full space-y-1">
                  <Progress value={loadProgress.percent} />
                  <p className="text-[11px] text-muted-foreground capitalize">{loadProgress.phase}…</p>
                </div>
              )}
              {!busy && audioFile && (
                <p className="text-xs text-foreground mt-2 truncate max-w-full" title={audioFile.name}>
                  ✓ {audioFile.name}
                </p>
              )}
            </div>
          </section>

          {/* Lyrics */}
          <section className="rounded-xl border border-border p-6 space-y-3">
            <h3 className="font-semibold">Lyrics</h3>
            <p className="text-xs text-muted-foreground">
              Paste the full lyrics. One line per row. Include repeated sections (chorus repeats) as separate lines.
            </p>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyricsLocal(e.target.value)}
              placeholder={"Is this the real life\nIs this just fantasy\n…"}
              className="min-h-[180px] font-mono text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{lyrics.split("\n").filter((l) => l.trim()).length} lines</p>
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept=".txt,.lrc,text/plain"
                  onChange={(e) => e.target.files?.[0] && onLyricsFile(e.target.files[0])}
                />
                <span className="inline-flex items-center gap-1 text-xs cursor-pointer rounded-md border border-border px-2 py-1 hover:bg-accent">
                  <FileText className="h-3 w-3" /> Load .txt / .lrc
                </span>
              </label>
            </div>
          </section>

          {/* Track info */}
          <section className="rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold">Track info</h3>
            <p className="text-xs text-muted-foreground">Optional — you can also edit these on the next step.</p>
            <div className="space-y-2">
              <Label>Song title</Label>
              <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Bohemian Rhapsody" />
            </div>
            <div className="space-y-2">
              <Label>Artist</Label>
              <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Queen" />
            </div>
          </section>
        </div>

        <div className="flex justify-center mt-10">
          <Button size="lg" onClick={submit} disabled={busy}>
            Continue →
          </Button>
        </div>
      </main>
    </div>
  );
}
