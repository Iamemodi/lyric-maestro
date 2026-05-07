import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useProject } from "@/store/project";
import {
  AudioWaveform,
  Clock,
  FileVideo,
  Music,
  Palette,
  RefreshCw,
  Sliders,
  Sparkles,
  Type,
  Video,
} from "lucide-react";

const items = [
  { to: "/app/basics", label: "Basics", icon: Music, key: "basics" },
  { to: "/app/options", label: "Options", icon: Sliders, key: "options" },
  { to: "/app/assignments", label: "Assignments", icon: Palette, key: "assignments" },
  { to: "/app/line-timings", label: "Line Timings", icon: Clock, key: "line-timings" },
  { to: "/app/resync", label: "Resync", icon: RefreshCw, key: "resync" },
  { to: "/app/word-timings", label: "Word Timings", icon: Type, key: "word-timings" },
  { to: "/app/generate", label: "Generate", icon: FileVideo, key: "generate" },
  { to: "/app/video", label: "Video", icon: Video, key: "video" },
  { to: "/app/remix", label: "Remix", icon: Sparkles, key: "remix" },
] as const;

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { title, lines, generated } = useProject();

  const completion: Record<string, boolean> = {
    basics: title.length > 0,
    options: true,
    assignments: lines.some((l) => l.voiceId != null),
    "line-timings": lines.some((l) => l.startTime != null),
    resync: true,
    "word-timings": lines.some((l) => l.words.some((w) => w.offset >= 0)),
    generate: generated.blobUrl != null,
    video: generated.blobUrl != null,
    remix: true,
  };

  return (
    <aside className="w-[220px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="p-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2">
          <AudioWaveform className="h-5 w-5 text-primary" />
          <span className="font-bold tracking-wide">MELLOW</span>
        </Link>
        <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Karaoke Studio</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          const done = completion[it.key];
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{it.label}</span>
              {done && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-[11px] text-muted-foreground border-t border-sidebar-border">
        100% in your browser
      </div>
    </aside>
  );
}
