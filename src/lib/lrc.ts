// Minimal LRC parser & writer (supports basic [mm:ss.xx] and enhanced <mm:ss.xx>)

export interface LrcLine {
  time: number; // seconds
  text: string;
  words?: { time: number; text: string }[];
}

const TS = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TS = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function toSeconds(m: string, s: string, frac?: string) {
  const cs = frac ? parseInt(frac.padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
  return parseInt(m, 10) * 60 + parseInt(s, 10) + cs;
}

export function parseLRC(text: string): { lines: LrcLine[]; title?: string; artist?: string } {
  const out: LrcLine[] = [];
  let title: string | undefined;
  let artist: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const meta = line.match(/^\[(ti|ar):(.*)\]$/i);
    if (meta) {
      if (meta[1].toLowerCase() === "ti") title = meta[2].trim();
      else artist = meta[2].trim();
      continue;
    }
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    TS.lastIndex = 0;
    while ((m = TS.exec(line))) stamps.push(toSeconds(m[1], m[2], m[3]));
    if (!stamps.length) continue;
    const rest = line.replace(TS, "").trim();
    // Enhanced word stamps
    const words: { time: number; text: string }[] = [];
    if (WORD_TS.test(rest)) {
      WORD_TS.lastIndex = 0;
      let lastIdx = 0;
      let lastT = stamps[0];
      let mm: RegExpExecArray | null;
      const tokens: { t: number; pos: number }[] = [];
      while ((mm = WORD_TS.exec(rest))) tokens.push({ t: toSeconds(mm[1], mm[2], mm[3]), pos: mm.index });
      // split rest by word stamps
      const cleaned = rest.replace(WORD_TS, "\u0000");
      const parts = cleaned.split("\u0000").map((p) => p.trim()).filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        words.push({ time: tokens[i]?.t ?? lastT, text: parts[i] });
      }
    }
    const cleanText = rest.replace(WORD_TS, "").replace(/\s+/g, " ").trim();
    for (const t of stamps) {
      out.push({ time: t, text: cleanText, words: words.length ? words : undefined });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return { lines: out, title, artist };
}

function fmtTime(sec: number) {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export interface LineForExport {
  startTime: number | null;
  text: string;
  words: { text: string; offset: number }[];
}

export function toLRC(lines: LineForExport[], title?: string, artist?: string): string {
  const header: string[] = [];
  if (title) header.push(`[ti:${title}]`);
  if (artist) header.push(`[ar:${artist}]`);
  header.push(`[by:Mellow]`);
  const body: string[] = [];
  for (const l of lines) {
    if (l.startTime == null) continue;
    const hasWords = l.words.some((w) => w.offset >= 0);
    if (hasWords) {
      const parts = l.words.map((w) => {
        const t = l.startTime! + Math.max(0, w.offset) / 1000;
        return `<${fmtTime(t)}>${w.text}`;
      });
      body.push(`[${fmtTime(l.startTime)}]${parts.join(" ")}`);
    } else {
      body.push(`[${fmtTime(l.startTime)}]${l.text}`);
    }
  }
  return [...header, "", ...body].join("\n");
}
