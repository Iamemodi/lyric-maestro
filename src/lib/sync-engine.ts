// Local lyrics-sync engine. No external services.
// Detects onsets on the audio's vocal band, then maps onsets to lines/words.

export type ProgressFn = (pct: number, label?: string) => void;

async function bandpassedMono(buffer: AudioBuffer, targetRate = 16000): Promise<Float32Array> {
  const duration = buffer.duration;
  const OAC =
    (window as any).OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext;
  const ctx: OfflineAudioContext = new OAC(1, Math.ceil(duration * targetRate), targetRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Band-pass: high-pass 200 Hz, then low-pass 4 kHz to emphasise vocals.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 200;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4000;
  src.connect(hp).connect(lp).connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

function energyEnvelope(signal: Float32Array, sampleRate: number) {
  const frame = 1024;
  const hop = 512;
  const frames = Math.max(0, Math.floor((signal.length - frame) / hop));
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < frame; j++) {
      const v = signal[start + j];
      sum += v * v;
    }
    env[i] = Math.sqrt(sum / frame);
  }
  return { env, hop, sampleRate };
}

function pickOnsets(env: Float32Array, hop: number, sampleRate: number): number[] {
  // First-order positive difference of a smoothed envelope.
  const smooth = new Float32Array(env.length);
  const W = 3;
  for (let i = 0; i < env.length; i++) {
    let s = 0, c = 0;
    for (let k = -W; k <= W; k++) {
      const j = i + k;
      if (j >= 0 && j < env.length) { s += env[j]; c++; }
    }
    smooth[i] = s / c;
  }
  const diff = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) {
    const d = smooth[i] - smooth[i - 1];
    diff[i] = d > 0 ? d : 0;
  }

  // Adaptive threshold via local mean.
  const win = 41;
  const half = (win - 1) >> 1;
  const thresh = new Float32Array(diff.length);
  for (let i = 0; i < diff.length; i++) {
    let s = 0, c = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < diff.length) { s += diff[j]; c++; }
    }
    thresh[i] = (s / c) * 2.2 + 1e-5;
  }

  const refractoryFrames = Math.max(1, Math.round((0.12 * sampleRate) / hop));
  const peaks: number[] = [];
  let lastPeak = -Infinity;
  for (let i = 1; i < diff.length - 1; i++) {
    if (
      diff[i] > thresh[i] &&
      diff[i] >= diff[i - 1] &&
      diff[i] >= diff[i + 1] &&
      i - lastPeak >= refractoryFrames
    ) {
      const t = (i * hop) / sampleRate;
      peaks.push(t);
      lastPeak = i;
    }
  }
  return peaks;
}

export async function detectOnsets(buffer: AudioBuffer, onProgress?: ProgressFn): Promise<number[]> {
  onProgress?.(5, "Filtering vocals…");
  const sr = 16000;
  const mono = await bandpassedMono(buffer, sr);
  onProgress?.(55, "Computing envelope…");
  const { env, hop, sampleRate } = energyEnvelope(mono, sr);
  onProgress?.(80, "Detecting onsets…");
  const onsets = pickOnsets(env, hop, sampleRate);
  onProgress?.(95);
  return onsets;
}

function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function alignLines(
  onsets: number[],
  lineTexts: string[],
  duration: number,
): { index: number; startSeconds: number }[] {
  const N = lineTexts.length;
  if (N === 0) return [];
  const result: { index: number; startSeconds: number }[] = [];
  if (onsets.length === 0) {
    // Even distribution fallback.
    for (let i = 0; i < N; i++) result.push({ index: i, startSeconds: (duration / (N + 1)) * (i + 1) });
    return result;
  }

  // Cluster onsets that are close together (< 350 ms gap) — first onset of each cluster
  // is a candidate "line start".
  const clusters: number[] = [];
  let lastT = -Infinity;
  for (const t of onsets) {
    if (t - lastT > 0.35) clusters.push(t);
    lastT = t;
  }

  // Weight lines by syllable count for proportional placement.
  const weights = lineTexts.map((t) => t.split(/\s+/).reduce((s, w) => s + syllableCount(w), 0));
  const totalW = weights.reduce((a, b) => a + b, 0);

  if (clusters.length >= N) {
    // Pick N evenly-spaced clusters across the available timeline.
    const step = clusters.length / N;
    for (let i = 0; i < N; i++) {
      const idx = Math.min(clusters.length - 1, Math.floor(i * step));
      result.push({ index: i, startSeconds: clusters[idx] });
    }
  } else {
    // Use all clusters as anchors and interpolate the rest by syllable weight.
    const firstStart = clusters[0];
    const lastStart = clusters[clusters.length - 1];
    const span = Math.max(1, lastStart - firstStart);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const w = weights[i];
      const ratio = totalW > 0 ? acc / totalW : i / N;
      result.push({ index: i, startSeconds: firstStart + ratio * span });
      acc += w;
    }
  }

  // Force monotonic + within duration.
  for (let i = 0; i < result.length; i++) {
    if (i > 0 && result[i].startSeconds <= result[i - 1].startSeconds) {
      result[i].startSeconds = result[i - 1].startSeconds + 0.05;
    }
    if (result[i].startSeconds > duration - 0.1) result[i].startSeconds = Math.max(0, duration - 0.1);
  }
  return result;
}

export function alignWords(
  onsets: number[],
  lines: { index: number; text: string; startSeconds: number; endSeconds: number }[],
): { lineIndex: number; wordOffsetsMs: number[] }[] {
  const out: { lineIndex: number; wordOffsetsMs: number[] }[] = [];
  for (const l of lines) {
    const words = l.text.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push({ lineIndex: l.index, wordOffsetsMs: [] }); continue; }
    const inWindow = onsets.filter((t) => t >= l.startSeconds && t < l.endSeconds);
    const span = Math.max(0.2, l.endSeconds - l.startSeconds);

    if (inWindow.length >= words.length) {
      // Pick `words.length` onsets, spaced through the available onsets.
      const step = inWindow.length / words.length;
      const offsets = words.map((_, i) => Math.round((inWindow[Math.floor(i * step)] - l.startSeconds) * 1000));
      out.push({ lineIndex: l.index, wordOffsetsMs: offsets });
    } else {
      // Use what we have plus syllable-weighted interpolation for the rest.
      const weights = words.map(syllableCount);
      const total = weights.reduce((a, b) => a + b, 0);
      const offsets: number[] = [];
      let acc = 0;
      for (let i = 0; i < words.length; i++) {
        const ratio = total > 0 ? acc / total : i / words.length;
        offsets.push(Math.round(ratio * span * 1000));
        acc += weights[i];
      }
      // Snap first word to first detected onset if any.
      if (inWindow.length > 0) offsets[0] = Math.max(0, Math.round((inWindow[0] - l.startSeconds) * 1000));
      out.push({ lineIndex: l.index, wordOffsetsMs: offsets });
    }
  }
  return out;
}

export async function autoSync(
  buffer: AudioBuffer,
  lineTexts: string[],
  onProgress?: ProgressFn,
) {
  const onsets = await detectOnsets(buffer, onProgress);
  const lineRes = alignLines(onsets, lineTexts, buffer.duration);
  const sorted = [...lineRes].sort((a, b) => a.startSeconds - b.startSeconds);
  const endByIdx = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i + 1]?.startSeconds ?? Math.min(buffer.duration, sorted[i].startSeconds + 8);
    endByIdx.set(sorted[i].index, next);
  }
  const wordPayload = lineRes.map((l) => ({
    index: l.index,
    text: lineTexts[l.index],
    startSeconds: l.startSeconds,
    endSeconds: endByIdx.get(l.index) ?? l.startSeconds + 8,
  }));
  const wordRes = alignWords(onsets, wordPayload);
  onProgress?.(100, "Done");
  return { lines: lineRes, words: wordRes };
}
