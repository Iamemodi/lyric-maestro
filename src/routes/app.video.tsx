import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Download, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toLRC } from "@/lib/lrc";
import { toast } from "sonner";

export const Route = createFileRoute("/app/video")({ component: VideoPage });

function VideoPage() {
  const { generated, title, artist, lines } = useProject();

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

  if (!generated.blobUrl) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4">
        <h1 className="text-2xl font-bold">No video yet</h1>
        <p className="text-muted-foreground text-sm">Render a video from the Generate step first.</p>
        <Button asChild><Link to="/app/generate">Go to Generate</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Your karaoke video</h1>
      <video controls src={generated.blobUrl} className="w-full rounded-xl border border-border bg-black" />

      <div className="flex flex-wrap items-center gap-2">
        <a href={generated.blobUrl} download={`${title || "karaoke"}.mp4`}>
          <Button><Download className="h-4 w-4 mr-2" />Download {generated.hd ? "HD" : "SD"}</Button>
        </a>
        {!generated.hd && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline"><Sparkles className="h-4 w-4 mr-2" />Finalize in HD (1080p)</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Render HD version?</AlertDialogTitle>
                <AlertDialogDescription>1080p takes significantly longer to encode in-browser. You can keep using the SD version while you wait.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild><Link to="/app/generate">Continue</Link></AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <Button variant="outline" onClick={exportLrc} className="ml-auto">
          <Download className="h-4 w-4 mr-2" /> Export .lrc
        </Button>
      </div>

      <div className="flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/remix">Remix / Edit →</Link></Button>
      </div>
    </div>
  );
}
