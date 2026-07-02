import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface LyricLine {
  id: string;
  text: string;
  voiceId: string | null;
  startTime: number | null;
  words: { text: string; offset: number }[];
}

export interface Voice {
  id: string;
  label: string;
  color: string;
}

export interface VideoOptions {
  aspectRatio: "16:9" | "4:3";
  backgroundColor: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  upcomingColor: string;
  sungColor: string;
  activeColor: string;
  displayMode: "scroll" | "fixed-3" | "fixed-1";
  voiceMode: "color" | "title";
  introSeconds: number;
  outroSeconds: number;
  useImageBackground: boolean;
  useImageIntro: boolean;
}

export type LoadProgress = {
  phase: "idle" | "reading" | "decoding" | "peaks" | "done" | "error";
  percent: number;
};

export interface ProjectState {
  audioFile: File | null;
  audioUrl: string | null;
  audioBuffer: AudioBuffer | null;
  rawArrayBuffer: ArrayBuffer | null;
  peaks: Float32Array | null;
  duration: number;

  title: string;
  artist: string;
  lines: LyricLine[];
  voices: Voice[];
  options: VideoOptions;

  coverImageDataUrl: string | null;
  loadProgress: LoadProgress;

  generated: { blobUrl: string | null; hd: boolean; tier?: string };

  loadFile: (file: File) => Promise<void>;
  setLyrics: (raw: string) => void;
  setMeta: (title: string, artist: string) => void;
  assignVoice: (lineId: string, voiceId: string | null) => void;
  cycleVoice: (lineId: string) => void;
  setLineStart: (lineId: string, time: number) => void;
  setWordOffsets: (lineId: string, offsets: number[]) => void;
  skipWordTimings: (lineId: string) => void;
  applyGlobalOffset: (delta: number) => void;
  resetTimings: () => void;
  updateOptions: (patch: Partial<VideoOptions>) => void;
  addVoice: () => void;
  removeVoice: (id: string) => void;
  updateVoice: (id: string, patch: Partial<Voice>) => void;
  setGenerated: (blobUrl: string | null, hd: boolean, tier?: string) => void;
  setCoverImage: (dataUrl: string | null) => void;
  restoreLines: (lines: LyricLine[]) => void;
}

const defaultVoices: Voice[] = [
  { id: "v1", label: "Voice 1", color: "#10B981" },
  { id: "v2", label: "Voice 2", color: "#06B6D4" },
  { id: "v3", label: "Voice 3", color: "#F59E0B" },
];

const defaultOptions: VideoOptions = {
  aspectRatio: "16:9",
  backgroundColor: "#0F0A1F",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 48,
  bold: true,
  italic: false,
  upcomingColor: "#6B7280",
  sungColor: "#374151",
  activeColor: "#FFFFFF",
  displayMode: "fixed-3",
  voiceMode: "color",
  introSeconds: 3,
  outroSeconds: 3,
  useImageBackground: false,
  useImageIntro: false,
};

const newId = () => Math.random().toString(36).slice(2, 10);

function parseLyrics(raw: string): LyricLine[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((text) => ({
      id: newId(),
      text,
      voiceId: null,
      startTime: null,
      words: text.split(/\s+/).map((w) => ({ text: w, offset: -1 })),
    }));
}

export const useProject = create<ProjectState>()(
  persist(
    (set, get) => ({
      audioFile: null,
      audioUrl: null,
      audioBuffer: null,
      rawArrayBuffer: null,
      peaks: null,
      duration: 0,
      title: "",
      artist: "",
      lines: [],
      voices: defaultVoices,
      options: defaultOptions,
      coverImageDataUrl: null,
      loadProgress: { phase: "idle", percent: 0 },
      generated: { blobUrl: null, hd: false },

      loadFile: async (file) => {
        // Revoke any previous object URL to avoid leaks across reloads.
        const prevUrl = get().audioUrl;
        if (prevUrl) {
          try { URL.revokeObjectURL(prevUrl); } catch {}
        }
        set({ loadProgress: { phase: "reading", percent: 5 } });
        const arr = await file.arrayBuffer();
        const url = URL.createObjectURL(file);
        set({ audioFile: file, audioUrl: url, rawArrayBuffer: null, loadProgress: { phase: "decoding", percent: 35 } });
        const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new AC();
        try {
          const buf = await ctx.decodeAudioData(arr.slice(0));
          set({ loadProgress: { phase: "peaks", percent: 70 } });
          const target = 3000;
          const channel = buf.getChannelData(0);
          const block = Math.max(1, Math.floor(channel.length / target));
          const peaks = new Float32Array(target);
          for (let i = 0; i < target; i++) {
            let max = 0;
            const start = i * block;
            const end = Math.min(channel.length, start + block);
            for (let j = start; j < end; j++) {
              const v = Math.abs(channel[j]);
              if (v > max) max = v;
            }
            peaks[i] = max;
          }
          // rawArrayBuffer intentionally not stored — frees ~file size of memory.
          set({ audioBuffer: buf, peaks, duration: buf.duration, loadProgress: { phase: "done", percent: 100 } });
        } catch (e) {
          console.error("decode failed", e);
          set({ loadProgress: { phase: "error", percent: 0 } });
        } finally {
          try { await ctx.close(); } catch {}
        }
      },

      setLyrics: (raw) => set({ lines: parseLyrics(raw) }),
      setMeta: (title, artist) => set({ title, artist }),

      assignVoice: (lineId, voiceId) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === lineId ? { ...l, voiceId } : l)) })),

      cycleVoice: (lineId) =>
        set((s) => {
          const ids = [null as string | null, ...s.voices.map((v) => v.id)];
          return {
            lines: s.lines.map((l) => {
              if (l.id !== lineId) return l;
              const idx = ids.indexOf(l.voiceId);
              const next = ids[(idx + 1) % ids.length];
              return { ...l, voiceId: next };
            }),
          };
        }),

      setLineStart: (lineId, time) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === lineId ? { ...l, startTime: time } : l)) })),

      setWordOffsets: (lineId, offsets) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id === lineId ? { ...l, words: l.words.map((w, i) => ({ ...w, offset: offsets[i] ?? w.offset })) } : l,
          ),
        })),

      skipWordTimings: (lineId) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.id === lineId ? { ...l, words: l.words.map((w) => ({ ...w, offset: -1 })) } : l)),
        })),

      applyGlobalOffset: (delta) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.startTime != null ? { ...l, startTime: Math.max(0, l.startTime + delta) } : l)),
        })),

      resetTimings: () =>
        set((s) => ({
          lines: s.lines.map((l) => ({ ...l, startTime: null, words: l.words.map((w) => ({ ...w, offset: -1 })) })),
        })),

      updateOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),

      addVoice: () =>
        set((s) => {
          const palette = ["#EF4444", "#8B5CF6", "#EC4899", "#22D3EE", "#84CC16"];
          const color = palette[s.voices.length % palette.length];
          return { voices: [...s.voices, { id: newId(), label: `Voice ${s.voices.length + 1}`, color }] };
        }),

      removeVoice: (id) =>
        set((s) => ({
          voices: s.voices.filter((v) => v.id !== id),
          lines: s.lines.map((l) => (l.voiceId === id ? { ...l, voiceId: null } : l)),
        })),

      updateVoice: (id, patch) =>
        set((s) => ({ voices: s.voices.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),

      setGenerated: (blobUrl, hd, tier) => {
        const prev = get().generated.blobUrl;
        if (prev && prev !== blobUrl) {
          try { URL.revokeObjectURL(prev); } catch {}
        }
        set({ generated: { blobUrl, hd, tier } });
      },
      setCoverImage: (dataUrl) => set({ coverImageDataUrl: dataUrl }),
      restoreLines: (lines) => set({ lines }),
    }),
    {
      name: "mellow-project",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        title: s.title,
        artist: s.artist,
        lines: s.lines,
        voices: s.voices,
        options: s.options,
        coverImageDataUrl: s.coverImageDataUrl,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // blobUrl is transient
          state.generated = { blobUrl: null, hd: false };
        }
      },
    },
  ),
);
