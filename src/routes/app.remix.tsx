import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/remix")({ component: RemixPage });

const steps = [
  { to: "/app/basics", title: "Basics", desc: "Edit song title, artist, and lyrics." },
  { to: "/app/options", title: "Options", desc: "Aspect ratio, fonts, colors, display mode." },
  { to: "/app/assignments", title: "Assignments", desc: "Assign voices to each lyric line." },
  { to: "/app/line-timings", title: "Line Timings", desc: "Sync the start of each line to the music." },
  { to: "/app/resync", title: "Resync", desc: "Shift all timings by an offset." },
  { to: "/app/word-timings", title: "Word Timings", desc: "Tap each word for bouncing-ball karaoke." },
  { to: "/app/generate", title: "Generate", desc: "Re-render the final video." },
] as const;

function RemixPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Remix</h1>
        <p className="text-sm text-muted-foreground">Jump back to any step. Your other settings are preserved.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {steps.map((s) => (
          <div key={s.to} className="rounded-xl border border-border p-4 flex items-start justify-between gap-3 hover:bg-accent/30 transition-colors">
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link to={s.to}>Edit</Link></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
