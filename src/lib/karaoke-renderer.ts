import type { LyricLine, Voice, VideoOptions } from "@/store/project";

export interface RenderInput {
  options: VideoOptions;
  lines: LyricLine[];
  voices: Voice[];
  time: number;
  title: string;
  artist: string;
  width: number;
  height: number;
  coverImage?: HTMLImageElement | null;
}

export function getCanvasSize(aspect: "16:9" | "4:3", base = 720) {
  if (aspect === "16:9") return { w: 1280, h: 720 };
  return { w: 960, h: 720 };
}

function voiceColor(voices: Voice[], id: string | null, fallback: string) {
  if (!id) return fallback;
  return voices.find((v) => v.id === id)?.color ?? fallback;
}

export function drawFrame(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { options, lines, voices, time, width, height, title, artist, coverImage } = input;

  // Background fill
  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const firstStart = lines.find((l) => l.startTime != null)?.startTime ?? options.introSeconds;
  const isIntro = time < firstStart - 0.05;

  // Image background (cover-fit) drawn behind everything
  const drawCover = (alpha = 1) => {
    if (!coverImage || !coverImage.complete || !coverImage.naturalWidth) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    const ir = coverImage.naturalWidth / coverImage.naturalHeight;
    const cr = width / height;
    let dw = width, dh = height, dx = 0, dy = 0;
    if (ir > cr) { dh = height; dw = height * ir; dx = (width - dw) / 2; }
    else { dw = width; dh = width / ir; dy = (height - dh) / 2; }
    ctx.drawImage(coverImage, dx, dy, dw, dh);
    ctx.restore();
    return true;
  };

  const showImageBg = options.useImageBackground && coverImage;
  const showImageIntro = options.useImageIntro && coverImage && isIntro;

  if (showImageBg) {
    drawCover(1);
    // dim overlay for legibility
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, width, height);
  } else if (showImageIntro) {
    drawCover(1);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, width, height);
  }

  // Intro card
  if (isIntro) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const titleSize = Math.round(options.fontSize * 1.3);
    ctx.font = `${options.bold ? "700 " : "600 "}${titleSize}px ${options.fontFamily}`;
    ctx.fillStyle = options.activeColor;
    ctx.fillText(title || "Untitled", width / 2, height / 2 - titleSize * 0.6);
    ctx.font = `${Math.round(options.fontSize * 0.7)}px ${options.fontFamily}`;
    ctx.fillStyle = options.upcomingColor;
    ctx.fillText(artist || "", width / 2, height / 2 + titleSize * 0.4);
    return;
  }

  const sorted = lines.filter((l) => l.startTime != null).sort((a, b) => a.startTime! - b.startTime!);
  let activeIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].startTime! <= time) activeIdx = i;
    else break;
  }
  const allLines = lines; // for scroll mode use full list (in original order for unset)

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontWeight = options.bold ? "700" : "500";
  const fontStyle = options.italic ? "italic " : "";
  ctx.font = `${fontStyle}${fontWeight} ${options.fontSize}px ${options.fontFamily}`;

  const drawLine = (line: LyricLine | undefined, x: number, y: number, status: "sung" | "active" | "upcoming", scale = 1) => {
    if (!line) return;
    const baseColor =
      status === "sung"
        ? options.sungColor
        : status === "upcoming"
          ? options.upcomingColor
          : options.voiceMode === "color"
            ? voiceColor(voices, line.voiceId, options.activeColor)
            : options.activeColor;

    const sz = Math.round(options.fontSize * scale);
    ctx.font = `${fontStyle}${fontWeight} ${sz}px ${options.fontFamily}`;

    if (status !== "active" || !line.words.some((w) => w.offset >= 0)) {
      ctx.fillStyle = baseColor;
      // Voice title mode
      if (options.voiceMode === "title" && line.voiceId && status === "active") {
        const v = voices.find((vv) => vv.id === line.voiceId);
        if (v) {
          ctx.font = `${Math.round(sz * 0.45)}px ${options.fontFamily}`;
          ctx.fillStyle = v.color;
          ctx.fillText(v.label, x, y - sz * 0.7);
          ctx.font = `${fontStyle}${fontWeight} ${sz}px ${options.fontFamily}`;
          ctx.fillStyle = baseColor;
        }
      }
      ctx.fillText(line.text, x, y);
      return;
    }

    // Word-by-word for active line
    const lineStart = line.startTime ?? 0;
    const elapsedMs = (time - lineStart) * 1000;
    const words = line.words;
    const widths = words.map((w) => ctx.measureText(w.text).width);
    const spaceW = ctx.measureText(" ").width;
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);
    let cursor = x - totalW / 2;
    ctx.textAlign = "left";

    if (options.voiceMode === "title" && line.voiceId) {
      const v = voices.find((vv) => vv.id === line.voiceId);
      if (v) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `${Math.round(sz * 0.45)}px ${options.fontFamily}`;
        ctx.fillStyle = v.color;
        ctx.fillText(v.label, x, y - sz * 0.7);
        ctx.restore();
        ctx.font = `${fontStyle}${fontWeight} ${sz}px ${options.fontFamily}`;
      }
    }

    const activeColor =
      options.voiceMode === "color" ? voiceColor(voices, line.voiceId, options.activeColor) : options.activeColor;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const reached = w.offset >= 0 && w.offset <= elapsedMs;
      ctx.fillStyle = reached ? activeColor : options.upcomingColor;
      ctx.fillText(w.text, cursor, y);
      cursor += widths[i] + spaceW;
    }
    ctx.textAlign = "center";
  };

  if (options.displayMode === "fixed-1") {
    const line = sorted[activeIdx];
    drawLine(line, width / 2, height / 2, "active", 1.2);
  } else if (options.displayMode === "fixed-3") {
    const prev = activeIdx > 0 ? sorted[activeIdx - 1] : undefined;
    const cur = activeIdx >= 0 ? sorted[activeIdx] : undefined;
    const next = sorted[activeIdx + 1];
    const lh = options.fontSize * 1.6;
    drawLine(prev, width / 2, height / 2 - lh, "sung", 0.85);
    drawLine(cur, width / 2, height / 2, "active", 1.1);
    drawLine(next, width / 2, height / 2 + lh, "upcoming", 0.85);
  } else {
    // scroll
    const lh = options.fontSize * 1.5;
    const centerY = height / 2;
    const list = allLines;
    // find index in full list
    const activeId = sorted[activeIdx]?.id;
    const idxFull = list.findIndex((l) => l.id === activeId);
    for (let i = 0; i < list.length; i++) {
      const y = centerY + (i - (idxFull >= 0 ? idxFull : 0)) * lh;
      if (y < -lh || y > height + lh) continue;
      const status: "sung" | "active" | "upcoming" =
        i === idxFull ? "active" : i < idxFull ? "sung" : "upcoming";
      drawLine(list[i], width / 2, y, status, status === "active" ? 1.05 : 0.85);
    }
  }
}
