import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  AudioWaveform,
  Captions,
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
  { to: "/app/basics", label: "Basics", icon: Music },
  { to: "/app/options", label: "Options", icon: Sliders },
  { to: "/app/assignments", label: "Assignments", icon: Palette },
  { to: "/app/line-timings", label: "Line Timings", icon: Clock },
  { to: "/app/resync", label: "Resync", icon: RefreshCw },
  { to: "/app/word-timings", label: "Word Timings", icon: Type },
  { to: "/app/generate", label: "Generate", icon: FileVideo },
  { to: "/app/video", label: "Video", icon: Video },
  { to: "/app/remix", label: "Remix", icon: Sparkles },
] as const;

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
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
              <span><Captions className="hidden" />{it.label}</span>
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
