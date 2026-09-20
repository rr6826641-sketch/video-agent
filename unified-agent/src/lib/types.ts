export type Aspect = "16:9" | "9:16" | "1:1";
export type Pacing = "quick" | "standard" | "deep" | "feature";
export type Grade = "cold" | "warm" | "neutral";
export type Sfx = "wind" | "fire" | "none";
export type Motion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "static";
export type ShotKind = "title" | "scene" | "cta";

export interface Shot {
  id: string;
  kind: ShotKind;
  chapter: string;
  caption: string;
  image?: string;
  motion: Motion;
  grade: Grade;
  sfx: Sfx;
  /** raw seconds before pacing is applied */
  weight: number;
  /** feature mode: only the opening cut of a beat shows the lower-third */
  first: boolean;
  duration: number;
  start: number;
}

export interface VideoScript {
  topic: string;
  channelId: string;
  channelName: string;
  channelEmoji: string;
  accent: string;
  title: string;
  subtitle: string;
  episode: string;
  shots: Shot[];
  duration: number;
  aspect: Aspect;
  pacing: Pacing;
  seed: number;
  wordCount: number;
}

export interface RenderOptions {
  captions: boolean;
  chapters: boolean;
  grain: boolean;
  vignette: boolean;
  bars: boolean;
  timecode: boolean;
  bug: boolean;
  sound: boolean;
  voice: boolean;
}

export interface Brief {
  topic: string;
  channelId: string;
  pacing: Pacing;
  aspect: Aspect;
  /** bumped on every run so each cut is a fresh variation */
  seed: number;
}

export interface ExportJob {
  status: "idle" | "recording" | "done" | "error";
  progress: number;
  url?: string;
  size?: number;
  seconds?: number;
  extension?: string;
  name?: string;
  error?: string;
}
