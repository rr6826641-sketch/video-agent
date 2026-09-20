import { AmbientAudio } from "./audio";
import {
  drawFrame,
  getShotAt,
  makeWeather,
  renderCoverArt,
  renderThumbnail,
  type Weather,
} from "./render";
import type { Aspect, RenderOptions, Sfx, VideoScript } from "./types";

export const ASPECTS: Record<Aspect, { w: number; h: number; ratio: string; label: string }> = {
  "16:9": { w: 1280, h: 720, ratio: "16 / 9", label: "Landscape" },
  "9:16": { w: 720, h: 1280, ratio: "9 / 16", label: "Vertical" },
  "1:1": { w: 1000, h: 1000, ratio: "1 / 1", label: "Square" },
};

export interface EngineState {
  time: number;
  playing: boolean;
  duration: number;
  ready: number;
  chapter: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class VideoEngine {
  canvas: HTMLCanvasElement | null = null;
  audio = new AmbientAudio();
  time = 0;
  playing = false;
  volume = 0.75;
  onEnded: (() => void) | null = null;

  private ctx: CanvasRenderingContext2D | null = null;
  private script: VideoScript;
  private opts: RenderOptions;
  private weather: Weather = makeWeather(1280, 720);
  private images = new Map<string, HTMLImageElement | null>();
  private loaded = 0;
  private total = 0;
  private listeners = new Set<(s: EngineState) => void>();
  private raf = 0;
  private last = 0;
  private uiClock = 0;
  private dirty = true;
  private lastSfx: Sfx | null = null;
  private lastSpoken = -1;
  private disposed = false;

  constructor(script: VideoScript, opts: RenderOptions) {
    this.script = script;
    this.opts = opts;
  }

  /* ----------------------------------------------------------- lifecycle */

  attach(canvas: HTMLCanvasElement) {
    if (this.canvas === canvas && this.raf) return;
    cancelAnimationFrame(this.raf);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.preload();
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
    this.canvas = null;
    this.ctx = null;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
    void this.audio.dispose();
  }

  subscribe(cb: (s: EngineState) => void) {
    this.listeners.add(cb);
    cb(this.state());
    return () => this.listeners.delete(cb);
  }

  /* -------------------------------------------------------------- config */

  setScript(script: VideoScript) {
    // identical object → nothing to re-cut (avoids flashing the loader)
    if (this.script === script && this.total > 0) return;
    this.script = script;
    this.time = 0;
    this.playing = false;
    this.stopVoice();
    this.images.clear();
    this.loaded = 0;
    this.total = 0;
    this.lastSfx = null;
    this.preload();
    this.resize();
    this.emit();
  }

  setOpts(opts: RenderOptions) {
    const hadVoice = this.opts.voice;
    this.opts = opts;
    this.dirty = true;
    this.audio.setVolume(opts.sound ? this.volume : 0);
    if (!opts.voice && hadVoice) this.stopVoice();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.opts.sound) this.audio.setVolume(v);
  }

  private resize() {
    if (!this.canvas) return;
    const { w, h } = ASPECTS[this.script.aspect];
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.weather = makeWeather(w, h);
    }
    this.dirty = true;
  }

  private preload() {
    const srcs = new Set<string>();
    for (const shot of this.script.shots) if (shot.image) srcs.add(shot.image);
    this.total = srcs.size;
    const pending = [...srcs].filter((src) => !this.images.has(src));
    pending.forEach((src) => {
      const img = new Image();
      img.decoding = "sync";
      img.onload = () => {
        this.images.set(src, img);
        this.loaded++;
        this.dirty = true;
        this.emit();
      };
      img.onerror = () => {
        this.images.set(src, null);
        this.loaded++;
        this.dirty = true;
        this.emit();
      };
      img.src = src;
    });
  }

  private getImage: (src?: string) => HTMLImageElement | null = (src) =>
    src ? this.images.get(src) ?? null : null;

  /* ------------------------------------------------------------ playback */

  get duration() {
    return this.script.duration;
  }

  get currentShot() {
    return getShotAt(this.script, this.time);
  }

  async play() {
    if (this.disposed) return;
    if (this.time >= this.duration - 0.05) this.time = 0;
    this.playing = true;
    this.dirty = true;
    if (this.opts.sound) {
      await this.audio.start();
      this.audio.setVolume(this.volume);
      await this.audio.resume();
      this.syncAudio(true);
    } else {
      this.audio.setVolume(0);
    }
    this.emit();
  }

  pause() {
    this.playing = false;
    this.stopVoice();
    void this.audio.suspend();
    this.emit();
  }

  async toggle() {
    if (this.playing) this.pause();
    else await this.play();
  }

  seek(seconds: number) {
    this.time = clamp(seconds, 0, this.duration);
    this.dirty = true;
    this.render();
    this.emit();
  }

  nudge(delta: number) {
    this.seek(this.time + delta);
  }

  jumpToShot(index: number) {
    const shot = this.script.shots[index];
    if (shot) this.seek(shot.start + 0.02);
  }

  private syncAudio(force = false) {
    if (!this.opts.sound || !this.audio.ready) return;
    const sfx = this.currentShot.shot.sfx;
    if (force || sfx !== this.lastSfx) {
      this.lastSfx = sfx;
      this.audio.setSfx(sfx);
    }
  }

  /* ----------------------------------------------------------- voice over */

  private speak(line: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = 1.03;
      utterance.pitch = 0.92;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* voice is a bonus, never fatal */
    }
  }

  private stopVoice() {
    this.lastSpoken = -1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
  }

  private syncVoice() {
    if (!this.opts.voice || !this.playing) return;
    const { shot, index } = this.currentShot;
    if (index === this.lastSpoken) return;
    this.lastSpoken = index;
    this.speak(shot.kind === "title" ? this.script.subtitle : shot.caption);
  }

  /* --------------------------------------------------------------- frame */

  private tick = (ts: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.06, (ts - this.last) / 1000) : 0;
    this.last = ts;

    if (this.playing) {
      this.time += dt;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this.playing = false;
        this.dirty = true;
        this.onEnded?.();
      }
      this.syncAudio();
      this.syncVoice();
    }

    if (this.playing || this.dirty) {
      this.render();
      this.dirty = false;
    }
    if (ts - this.uiClock > 90) {
      this.uiClock = ts;
      this.emit();
    }
  };

  render() {
    if (!this.ctx) return;
    drawFrame({
      ctx: this.ctx,
      script: this.script,
      time: this.time,
      opts: this.opts,
      getImage: this.getImage,
      weather: this.weather,
      w: this.script ? ASPECTS[this.script.aspect].w : 1280,
      h: this.script ? ASPECTS[this.script.aspect].h : 720,
      seed: this.script.shots.length,
    });
  }

  thumbnails(w: number, h: number): string[] {
    return this.script.shots.map((_, i) => renderThumbnail(this.script, i, this.getImage, w, h) ?? "");
  }

  coverArt(w = 1280, h = 720): string | null {
    return renderCoverArt(this.script, this.getImage, w, h);
  }

  state(): EngineState {
    const { shot } = this.currentShot;
    return {
      time: this.time,
      playing: this.playing,
      duration: this.duration,
      ready: this.total === 0 ? 1 : this.loaded / this.total,
      chapter: shot.chapter,
    };
  }

  private emit() {
    if (this.disposed) return;
    const s = this.state();
    this.listeners.forEach((l) => l(s));
  }
}
