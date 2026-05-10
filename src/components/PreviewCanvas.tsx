import { useEffect, useRef } from "react";
import { useProject } from "@/store/project";
import { drawFrame, getCanvasSize } from "@/lib/karaoke-renderer";
import { useAudioState } from "@/lib/audio-engine";
import { useCoverImage } from "@/lib/use-cover-image";

interface Props {
  width?: number;
  time?: number;
  placeholder?: boolean;
  className?: string;
}

const placeholderLines = [
  { id: "p1", text: "Lorem ipsum dolor sit amet", voiceId: "v1", startTime: 0, words: [] as { text: string; offset: number }[] },
  { id: "p2", text: "Consectetur adipiscing elit sed", voiceId: "v2", startTime: 3, words: [] },
  { id: "p3", text: "Do eiusmod tempor incididunt", voiceId: "v3", startTime: 6, words: [] },
  { id: "p4", text: "Ut labore et dolore magna", voiceId: "v1", startTime: 9, words: [] },
];

export function PreviewCanvas({ width = 760, time, placeholder = false, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { options, lines, voices, title, artist } = useProject();
  const audio = useAudioState();
  const cover = useCoverImage();
  const t = time ?? audio.time;

  const { w, h } = getCanvasSize(options.aspectRatio);
  const scale = width / w;
  const cssH = h * scale;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(ctx, {
      options,
      lines: placeholder ? (placeholderLines as any) : lines,
      voices,
      time: placeholder ? ((t % 12)) : t,
      title: placeholder ? "Song Title" : title,
      artist: placeholder ? "Artist Name" : artist,
      width: w,
      height: h,
      coverImage: cover,
    });
  }, [options, lines, voices, t, title, artist, placeholder, w, h, cover]);

  return (
    <canvas
      ref={ref}
      style={{ width, height: cssH }}
      className={"rounded-lg border border-border bg-black " + (className ?? "")}
    />
  );
}
