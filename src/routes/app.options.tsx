import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/store/project";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PreviewCanvas } from "@/components/PreviewCanvas";

export const Route = createFileRoute("/app/options")({ component: OptionsPage });

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-14 rounded cursor-pointer bg-transparent" />
    </div>
  );
}

function OptionsPage() {
  const { options, updateOptions } = useProject();
  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Options</h1>
        <Tabs defaultValue="video">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="video">Video</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="frames">Frames</TabsTrigger>
            <TabsTrigger value="voices">Voices</TabsTrigger>
          </TabsList>

          <TabsContent value="video" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <div className="flex gap-2">
                {(["16:9", "4:3"] as const).map((a) => (
                  <Button key={a} size="sm" variant={options.aspectRatio === a ? "default" : "outline"} onClick={() => updateOptions({ aspectRatio: a })}>
                    {a}
                  </Button>
                ))}
              </div>
            </div>
            <ColorInput label="Background" value={options.backgroundColor} onChange={(v) => updateOptions({ backgroundColor: v })} />
          </TabsContent>

          <TabsContent value="text" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Font family</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={options.fontFamily}
                onChange={(e) => updateOptions({ fontFamily: e.target.value })}
              >
                <option value="system-ui, -apple-system, sans-serif">System sans</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Courier New', monospace">Courier</option>
                <option value="'Helvetica Neue', Arial, sans-serif">Helvetica</option>
                <option value="'Times New Roman', serif">Times</option>
                <option value="Impact, sans-serif">Impact</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Font size: {options.fontSize}px</Label>
              <Slider min={20} max={96} step={2} value={[options.fontSize]} onValueChange={([v]) => updateOptions({ fontSize: v })} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={options.bold} onCheckedChange={(v) => updateOptions({ bold: v })} /> Bold</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={options.italic} onCheckedChange={(v) => updateOptions({ italic: v })} /> Italic</label>
            </div>
            <ColorInput label="Active line/word" value={options.activeColor} onChange={(v) => updateOptions({ activeColor: v })} />
            <ColorInput label="Upcoming color" value={options.upcomingColor} onChange={(v) => updateOptions({ upcomingColor: v })} />
            <ColorInput label="Sung color" value={options.sungColor} onChange={(v) => updateOptions({ sungColor: v })} />
            <div className="space-y-2">
              <Label>Display mode</Label>
              <div className="flex gap-2 flex-wrap">
                {(["fixed-1", "fixed-3", "scroll"] as const).map((m) => (
                  <Button key={m} size="sm" variant={options.displayMode === m ? "default" : "outline"} onClick={() => updateOptions({ displayMode: m })}>
                    {m === "fixed-1" ? "1 line" : m === "fixed-3" ? "3 lines" : "Scroll"}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="frames" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Intro card duration: {options.introSeconds}s</Label>
              <Slider min={0} max={10} step={0.5} value={[options.introSeconds]} onValueChange={([v]) => updateOptions({ introSeconds: v })} />
            </div>
            <div className="space-y-2">
              <Label>Outro duration: {options.outroSeconds}s</Label>
              <Slider min={0} max={10} step={0.5} value={[options.outroSeconds]} onValueChange={([v]) => updateOptions({ outroSeconds: v })} />
            </div>
          </TabsContent>

          <TabsContent value="voices" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Voice display mode</Label>
              <div className="flex gap-2">
                {(["color", "title"] as const).map((m) => (
                  <Button key={m} size="sm" variant={options.voiceMode === m ? "default" : "outline"} onClick={() => updateOptions({ voiceMode: m })}>
                    {m === "color" ? "Color mode" : "Title mode"}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Color mode: each voice colors its active words. Title mode: voice name appears above the line.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex flex-col items-center gap-3">
        <h2 className="font-semibold self-start">Live preview (placeholder lyrics)</h2>
        <PreviewCanvas placeholder width={760} />
        <p className="text-xs text-muted-foreground">Animates over a 12s loop</p>
      </div>

      <div className="lg:col-span-2 flex justify-end pt-6 border-t border-border mt-8">
        <Button asChild><Link to="/app/assignments">Next: Assignments →</Link></Button>
      </div>
    </div>
  );
}
