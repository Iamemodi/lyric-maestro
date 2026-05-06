type Listener = (time: number, playing: boolean) => void;

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private raf = 0;
  private url: string | null = null;

  setSource(url: string | null) {
    if (this.url === url) return;
    this.url = url;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.addEventListener("play", () => this.tick());
      this.el.addEventListener("pause", () => this.emit());
      this.el.addEventListener("seeked", () => this.emit());
      this.el.addEventListener("ended", () => this.emit());
    }
    if (url) this.el.src = url;
  }

  get currentTime() {
    return this.el?.currentTime ?? 0;
  }
  get duration() {
    return this.el?.duration ?? 0;
  }
  get playing() {
    return !!this.el && !this.el.paused;
  }

  play() {
    return this.el?.play();
  }
  pause() {
    this.el?.pause();
  }
  seek(t: number) {
    if (this.el) this.el.currentTime = Math.max(0, t);
    this.emit();
  }
  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l(this.currentTime, this.playing);
  }

  private tick = () => {
    this.emit();
    if (this.playing) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.raf);
    }
  };
}

export const audioEngine = new AudioEngine();

import { useEffect, useState } from "react";

export function useAudioState() {
  const [state, setState] = useState({ time: audioEngine.currentTime, playing: audioEngine.playing });
  useEffect(() => audioEngine.subscribe((time, playing) => setState({ time, playing })), []);
  return state;
}
