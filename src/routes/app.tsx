import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Waveform } from "@/components/Waveform";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useProject } from "@/store/project";
import { audioEngine } from "@/lib/audio-engine";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const s = useProject.getState();
      if (!s.audioFile) {
        throw redirect({ to: "/" });
      }
    }
  },
  component: AppShell,
});

function AppShell() {
  const { title, artist, audioUrl } = useProject();
  useEffect(() => {
    if (audioUrl) audioEngine.setSource(audioUrl);
  }, [audioUrl]);
  return (
    <div className="h-screen flex w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border px-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-semibold truncate">{title || "Untitled"}</p>
            <p className="text-xs text-muted-foreground truncate">{artist || "—"}</p>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <Waveform />
      </div>
    </div>
  );
}
