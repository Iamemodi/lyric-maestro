import { useEffect, useState } from "react";
import { useProject } from "@/store/project";

/** Returns a decoded HTMLImageElement for the project's cover image, or null. */
export function useCoverImage(): HTMLImageElement | null {
  const dataUrl = useProject((s) => s.coverImageDataUrl);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setImg(null);
      return;
    }
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setImg(null);
    i.src = dataUrl;
  }, [dataUrl]);
  return img;
}
