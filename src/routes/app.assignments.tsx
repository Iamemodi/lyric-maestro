import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/assignments")({ component: AssignmentsPage });

function AssignmentsPage() {
  const { lines, voices, cycleVoice, assignVoice, addVoice, removeVoice, updateVoice } = useProject();

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1">Voice assignments</h1>
        <p className="text-sm text-muted-foreground mb-4">Click a line to cycle voices, or use the menu for direct pick.</p>
        <div className="rounded-lg border border-border divide-y divide-border max-h-[60vh] overflow-y-auto">
          {lines.map((line) => {
            const v = voices.find((vv) => vv.id === line.voiceId);
            return (
              <div key={line.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="h-7 w-12 rounded shrink-0 border border-border text-[10px] font-bold"
                      style={{ background: v?.color ?? "transparent", color: v ? "#000" : undefined }}
                    >
                      {v?.label.replace("Voice ", "V") ?? "—"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2 space-y-1">
                    <button onClick={() => assignVoice(line.id, null)} className="w-full text-left px-2 py-1 rounded hover:bg-accent text-sm">
                      None
                    </button>
                    {voices.map((vv) => (
                      <button
                        key={vv.id}
                        onClick={() => assignVoice(line.id, vv.id)}
                        className="w-full text-left px-2 py-1 rounded hover:bg-accent text-sm flex items-center gap-2"
                      >
                        <span className="h-3 w-3 rounded-sm" style={{ background: vv.color }} />
                        {vv.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <button onClick={() => cycleVoice(line.id)} className="flex-1 text-left text-sm py-1">
                  {line.text}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Voices</h2>
          <Button size="sm" variant="outline" onClick={addVoice}><Plus className="h-3 w-3" /></Button>
        </div>
        <div className="space-y-2">
          {voices.map((v) => (
            <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
              <input type="color" value={v.color} onChange={(e) => updateVoice(v.id, { color: e.target.value })} className="h-7 w-10 rounded cursor-pointer bg-transparent" />
              <Input value={v.label} onChange={(e) => updateVoice(v.id, { label: e.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => removeVoice(v.id)} className="h-7 w-7">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </aside>

      <div className="lg:col-span-2 flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/line-timings">Next: Line Timings →</Link></Button>
      </div>
    </div>
  );
}
