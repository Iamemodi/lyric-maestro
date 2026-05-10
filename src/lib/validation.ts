export type Validation = { ok: true } | { ok: false; error: string };

const MB = 1024 * 1024;

const audioExt = /\.(mp3|wav|m4a|flac|ogg|mp4)$/i;
const imageExt = /\.(jpe?g|png|gif)$/i;
const txtExt = /\.txt$/i;

export function validateAudio(file: File): Validation {
  if (!file) return { ok: false, error: "No file selected" };
  if (!audioExt.test(file.name) && !file.type.startsWith("audio/") && !file.type.startsWith("video/"))
    return { ok: false, error: "Audio must be MP3, WAV, M4A, FLAC, OGG, or MP4." };
  if (file.size > 100 * MB) return { ok: false, error: `Audio file is ${(file.size / MB).toFixed(1)}MB — max is 100MB.` };
  if (file.size === 0) return { ok: false, error: "Audio file is empty." };
  return { ok: true };
}

export function validateImage(file: File): Validation {
  if (!file) return { ok: false, error: "No file selected" };
  if (!imageExt.test(file.name) && !file.type.startsWith("image/"))
    return { ok: false, error: "Image must be JPG, PNG, or GIF." };
  if (file.size > 10 * MB) return { ok: false, error: `Image is ${(file.size / MB).toFixed(1)}MB — max is 10MB.` };
  if (file.size === 0) return { ok: false, error: "Image is empty." };
  return { ok: true };
}

export function validateLyricsFile(file: File): Validation {
  if (!file) return { ok: false, error: "No file selected" };
  if (!txtExt.test(file.name) && file.type !== "text/plain")
    return { ok: false, error: "Lyrics file must be a .txt file." };
  if (file.size > 1 * MB) return { ok: false, error: `Lyrics file is ${(file.size / MB).toFixed(2)}MB — max is 1MB.` };
  if (file.size === 0) return { ok: false, error: "Lyrics file is empty." };
  return { ok: true };
}

/** Downscale an image file into a JPEG data URL with a max long-side dimension. */
export async function downscaleImageToDataUrl(file: File, maxSide = 1920, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Could not decode image."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
