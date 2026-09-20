import { fmt } from "./script";
import type { Grade, RenderOptions, Shot, VideoScript } from "./types";

export type ImageGetter = (src?: string) => HTMLImageElement | null;

/* ------------------------------------------------------------------ maths */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const wrap = (v: number, m: number) => ((v % m) + m) % m;
const fract = (n: number) => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

/* ----------------------------------------------------------------- timing */

export function getShotAt(script: VideoScript, time: number) {
  const shots = script.shots;
  let index = 0;
  for (let i = 0; i < shots.length; i++) if (time >= shots[i].start) index = i;
  const shot = shots[index];
  const local = clamp(time - shot.start, 0, shot.duration);
  return { shot, index, local, p: shot.duration > 0 ? local / shot.duration : 0 };
}

export interface Camera {
  scale: number;
  dx: number;
  dy: number;
}

export function cameraFor(shot: Shot, p: number): Camera {
  const e = easeInOut(p);
  switch (shot.motion) {
    case "zoom-in":
      return { scale: 1.04 + 0.16 * e, dx: 0, dy: -0.012 * e };
    case "zoom-out":
      return { scale: 1.2 - 0.16 * e, dx: 0, dy: 0.012 * e };
    case "pan-left":
      return { scale: 1.17, dx: 0.04 - 0.08 * e, dy: 0 };
    case "pan-right":
      return { scale: 1.17, dx: -0.04 + 0.08 * e, dy: 0 };
    default:
      return { scale: 1.08, dx: 0, dy: 0 };
  }
}

/* ---------------------------------------------------------------- imagery */

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  cam: Camera,
) {
  const iw = img.naturalWidth || 16;
  const ih = img.naturalHeight || 9;
  const base = Math.max(w / iw, h / ih) * cam.scale;
  const dw = iw * base;
  const dh = ih * base;
  ctx.drawImage(img, (w - dw) / 2 + cam.dx * w, (h - dh) / 2 + cam.dy * h, dw, dh);
}

/** Painted fallback so the film still reads if a plate fails to decode. */
function drawProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, grade: Grade, seed: number) {
  const warm = grade === "warm";
  const dawn = seed % 3 === 2 && !warm;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (warm) {
    sky.addColorStop(0, "#08101d");
    sky.addColorStop(0.55, "#1d1414");
    sky.addColorStop(1, "#43261a");
  } else if (dawn) {
    sky.addColorStop(0, "#122244");
    sky.addColorStop(0.5, "#4a4a72");
    sky.addColorStop(1, "#d98a6a");
  } else {
    sky.addColorStop(0, "#050b18");
    sky.addColorStop(0.55, "#16283f");
    sky.addColorStop(1, "#405d78");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (!warm) {
    // aurora ribbons
    for (let r = 0; r < 3; r++) {
      ctx.save();
      ctx.globalAlpha = 0.16 - r * 0.04;
      ctx.strokeStyle = dawn ? "#ffb98a" : "#6ff0c8";
      ctx.lineWidth = h * (0.05 - r * 0.012);
      ctx.beginPath();
      for (let x = 0; x <= w; x += w / 40) {
        const y =
          h * (0.18 + r * 0.07) +
          Math.sin(x / (w / 3.2) + t * 0.25 + r) * h * 0.05 +
          Math.sin(x / (w / 7) - t * 0.4) * h * 0.015;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // interior glow
    const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.55);
    g.addColorStop(0, `rgba(255,168,86,${0.5 + Math.sin(t * 6) * 0.06})`);
    g.addColorStop(0.5, "rgba(190,96,40,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ridgelines / arches
  const layers = warm ? 1 : 3;
  for (let l = 0; l < layers; l++) {
    const baseY = h * (warm ? 0.42 : 0.5 + l * 0.11);
    const amp = h * (warm ? 0.3 : 0.13 - l * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 26) {
      const n = fract(seed * 12.9 + l * 4.7 + Math.floor(x / (w / 26)) * 1.37);
      const y = baseY - n * amp + Math.sin(x / w * 4 + t * 0.1) * h * 0.008;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const shade = warm ? 0.5 + l * 0.2 : 0.22 + l * 0.24;
    ctx.fillStyle = `rgba(6,10,18,${shade})`;
    ctx.fill();
    ctx.strokeStyle = warm ? "rgba(255,190,130,0.18)" : "rgba(190,220,255,0.22)";
    ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.stroke();
  }
}

function drawBase(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  p: number,
  args: { w: number; h: number; getImage: ImageGetter; seed: number; time: number },
) {
  const cam = cameraFor(shot, p);
  const img = shot.image ? args.getImage(shot.image) : null;
  if (img && img.naturalWidth > 0) {
    drawImageCover(ctx, img, args.w, args.h, cam);
  } else {
    drawProcedural(ctx, args.w, args.h, args.time, shot.grade, args.seed);
  }
}

export function applyGrade(ctx: CanvasRenderingContext2D, w: number, h: number, grade: Grade) {
  if (grade === "neutral") return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = grade === "warm" ? "rgba(255,146,66,0.6)" : "rgba(96,158,255,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h * 0.5, r * 0.32, w / 2, h * 0.5, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

let noiseTile: HTMLCanvasElement | null = null;
function getNoise(): HTMLCanvasElement | null {
  if (noiseTile) return noiseTile;
  const c = document.createElement("canvas");
  c.width = 140;
  c.height = 140;
  const cx = c.getContext("2d");
  if (!cx) return null;
  const data = cx.createImageData(c.width, c.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  cx.putImageData(data, 0, 0);
  noiseTile = c;
  return c;
}

export function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  const tile = getNoise();
  if (!tile) return;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.translate(-Math.random() * 140, -Math.random() * 140);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w + 140, h + 140);
  ctx.restore();
}

/* --------------------------------------------------------------- weather */

export interface Flake {
  x: number;
  y: number;
  r: number;
  v: number;
  drift: number;
  phase: number;
}
export interface Ember {
  x: number;
  v: number;
  r: number;
  phase: number;
}
export interface Weather {
  snow: Flake[];
  embers: Ember[];
}

export function makeWeather(w: number, h: number): Weather {
  const snow: Flake[] = [];
  for (let i = 0; i < 130; i++) {
    snow.push({
      x: fract(i * 3.31) * w,
      y: fract(i * 7.77 + 1.3) * h,
      r: 0.6 + fract(i * 2.19) * (Math.min(w, h) * 0.0055),
      v: h * (0.012 + fract(i * 5.13) * 0.05),
      drift: w * (0.004 + fract(i * 9.71) * 0.02),
      phase: fract(i * 11.3) * Math.PI * 2,
    });
  }
  const embers: Ember[] = [];
  for (let i = 0; i < 46; i++) {
    embers.push({
      x: fract(i * 4.71 + 0.5) * w,
      v: 0.1 + fract(i * 6.13) * 0.3,
      r: 0.8 + fract(i * 8.31) * 2.4,
      phase: fract(i * 13.7),
    });
  }
  return { snow, embers };
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  weather: Weather,
  w: number,
  h: number,
  t: number,
  kind: "snow" | "ember",
) {
  ctx.save();
  if (kind === "snow") {
    ctx.fillStyle = "#ffffff";
    for (const f of weather.snow) {
      const y = wrap(f.y + t * f.v, h + 40) - 20;
      const x = wrap(f.x + Math.sin(t * 0.5 + f.phase) * f.drift + t * w * 0.006, w + 40) - 20;
      ctx.globalAlpha = 0.18 + fract(f.phase + t * 0.1) * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const e of weather.embers) {
      const life = wrap(t * e.v + e.phase, 1);
      const y = h * 0.86 - life * h * 0.72;
      const x = wrap(e.x + Math.sin(life * 7 + e.phase * 6) * w * 0.02, w);
      ctx.globalAlpha = (1 - life) * 0.75;
      ctx.fillStyle = life < 0.25 ? "#ffd9a0" : "#ff8a3d";
      ctx.beginPath();
      ctx.arc(x, y, e.r * (0.5 + life), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ text */

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let total = 0;
  for (const c of text) total += ctx.measureText(c).width + tracking;
  return Math.max(0, total - tracking);
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "center" = "left",
) {
  const chars = [...text];
  const total = trackedWidth(ctx, text, tracking);
  let cx = align === "center" ? x - total / 2 : x;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + tracking;
  }
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const SANS = '"Inter", "Helvetica Neue", system-ui, -apple-system, sans-serif';
const MONO = '"SFMono-Regular", ui-monospace, "Roboto Mono", Menlo, monospace';

/* -------------------------------------------------------------- overlays */

function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  script: VideoScript,
  w: number,
  h: number,
  p: number,
  base: number,
) {
  const inA = easeOut(clamp(p * 3.2, 0, 1));
  const cx = w / 2;
  const titleSize = Math.min(base * 0.15, w * 0.135);
  const eyebrowSize = Math.min(base * 0.048, w * 0.042);
  const subSize = Math.min(base * 0.055, w * 0.05);

  const scrim = ctx.createLinearGradient(0, h * 0.16, 0, h);
  scrim.addColorStop(0, "rgba(3,7,14,0.6)");
  scrim.addColorStop(0.55, "rgba(3,7,14,0.34)");
  scrim.addColorStop(1, "rgba(3,7,14,0.86)");

  ctx.save();
  ctx.globalAlpha = inA;
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "left";

  ctx.font = `800 ${titleSize}px ${SANS}`;
  const lines = wrapLines(ctx, script.title, w * 0.84).slice(0, 3);
  const lh = titleSize * 1.1;
  const eyebrowH = eyebrowSize * 1.7;
  const ruleGap = titleSize * 0.52;
  const totalH = eyebrowH + titleSize * 0.95 + (lines.length - 1) * lh + ruleGap + subSize * 1.4;
  let y = h * 0.5 - totalH / 2 + eyebrowSize * 1.2;

  ctx.font = `700 ${eyebrowSize}px ${SANS}`;
  ctx.fillStyle = script.accent;
  drawTracked(ctx, script.episode.toUpperCase(), cx, y, eyebrowSize * 0.2, "center");
  y += eyebrowH;

  ctx.font = `800 ${titleSize}px ${SANS}`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = titleSize * 0.4;
  ctx.shadowOffsetY = titleSize * 0.03;
  lines.forEach((line, i) => {
    drawTracked(ctx, line, cx, y + titleSize * 0.92 + i * lh, titleSize * 0.008, "center");
  });
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  y += titleSize * 0.92 + (lines.length - 1) * lh + ruleGap * 0.5;

  const ruleW = Math.min(w * 0.34, titleSize * 3.4) * inA;
  ctx.fillStyle = script.accent;
  ctx.fillRect(cx - ruleW / 2, y - titleSize * 0.3, ruleW, Math.max(2, titleSize * 0.024));
  y += ruleGap * 0.55 + subSize * 0.85;

  ctx.textAlign = "center";
  ctx.font = `500 ${subSize}px ${SANS}`;
  ctx.fillStyle = "rgba(228,238,255,0.86)";
  wrapLines(ctx, script.subtitle, w * 0.8)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, cx, y + i * subSize * 1.4));
  ctx.restore();
}

function drawLowerThird(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  accent: string,
  w: number,
  h: number,
  local: number,
  base: number,
) {
  const enter = 0.45;
  const hold = 3.0;
  const exit = 0.4;
  if (local < enter || local > enter + hold + exit) return;
  const a =
    local < enter
      ? easeOut(local / enter)
      : local > enter + hold
        ? 1 - easeOut((local - enter - hold) / exit)
        : 1;
  const slide = (1 - easeOut(clamp(local / enter, 0, 1))) * -base * 0.05;

  const size = Math.min(base * 0.042, w * 0.036);
  const tracking = size * 0.14;
  const text = shot.chapter.toUpperCase();

  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.textAlign = "left";
  const tw = trackedWidth(ctx, text, tracking);
  const padX = size * 0.75;
  const padY = size * 0.5;
  const barW = Math.max(3, size * 0.18);
  const x = w * 0.075 + slide;
  const boxY = h * 0.665;
  const boxW = barW + padX + tw + padX;
  const boxH = size + padY * 2;

  ctx.fillStyle = "rgba(4,9,16,0.62)";
  roundRect(ctx, x, boxY, boxW, boxH, size * 0.3);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x, boxY, barW, boxH);
  ctx.fillStyle = "#f4f8ff";
  drawTracked(ctx, text, x + barW + padX, boxY + padY + size * 0.82, tracking);
  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  w: number,
  h: number,
  local: number,
  base: number,
) {
  const fadeIn = 0.35;
  const fadeOut = 0.35;
  const inA = easeOut(clamp(local / fadeIn, 0, 1));
  const outA = 1 - easeOut(clamp((local - (shot.duration - fadeOut)) / fadeOut, 0, 1));
  const a = Math.min(inA, outA);
  if (a <= 0.01) return;

  const size = Math.min(base * 0.05, w * 0.032);
  ctx.save();
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.textAlign = "center";
  const lines = wrapLines(ctx, shot.caption, w * (shot.kind === "cta" ? 0.8 : 0.74)).slice(0, 4);
  const lh = size * 1.42;
  const blockH = lines.length * lh;
  const bottom = h * 0.92;
  const top = bottom - blockH;

  const scrim = ctx.createLinearGradient(0, top - size, 0, h);
  scrim.addColorStop(0, "rgba(2,6,12,0)");
  scrim.addColorStop(1, "rgba(2,6,12,0.78)");
  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = scrim;
  ctx.fillRect(0, top - size * 1.6, w, h - (top - size * 1.6));
  ctx.globalAlpha = a;

  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, top + lh * (i + 0.78));
  });
  ctx.restore();
}

function drawBug(
  ctx: CanvasRenderingContext2D,
  script: VideoScript,
  w: number,
  h: number,
  time: number,
  top: number,
  base: number,
) {
  const a = easeOut(clamp((time - 0.7) / 0.6, 0, 1));
  if (a <= 0.01) return;
  const size = Math.min(base * 0.036, w * 0.032);
  const tracking = size * 0.12;
  const label = script.channelName.toUpperCase();

  ctx.save();
  ctx.globalAlpha = a * 0.94;
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.textAlign = "left";
  const tw = trackedWidth(ctx, label, tracking);
  const padX = size * 0.8;
  const dotR = size * 0.26;
  const boxW = padX + dotR * 2 + size * 0.5 + tw + padX;
  const boxH = size * 2.1;
  const x = w - boxW - w * 0.05;
  const y = top + h * 0.018;
  ctx.fillStyle = "rgba(4,9,16,0.52)";
  roundRect(ctx, x, y, boxW, boxH, boxH / 2);
  ctx.fill();
  ctx.fillStyle = script.accent;
  ctx.beginPath();
  ctx.arc(x + padX + dotR, y + boxH / 2, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244,248,255,0.96)";
  drawTracked(ctx, label, x + padX + dotR * 2 + size * 0.5, y + boxH / 2 + size * 0.36, tracking);
  ctx.restore();
}

function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bar = h * 0.055;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
}

function drawTimecode(
  ctx: CanvasRenderingContext2D,
  script: VideoScript,
  w: number,
  h: number,
  time: number,
  top: number,
  base: number,
) {
  const size = Math.min(base * 0.032, w * 0.028);
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = "rgba(226,236,255,0.66)";
  ctx.fillText(`${fmt(time)} / ${fmt(script.duration)}`, w * 0.05, top + h * 0.02 + size);
  ctx.restore();
}

function drawProgress(ctx: CanvasRenderingContext2D, script: VideoScript, time: number, w: number, h: number) {
  const y = h - Math.max(3, h * 0.008);
  const bar = Math.max(3, h * 0.008);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(0, y, w, bar);
  ctx.fillStyle = script.accent;
  ctx.fillRect(0, y, w * clamp(time / script.duration, 0, 1), bar);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (const s of script.shots) {
    if (s.start <= 0) continue;
    ctx.fillRect((s.start / script.duration) * w - 0.5, y, 1, bar * 1.9);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ----------------------------------------------------------------- frame */

export interface FrameArgs {
  ctx: CanvasRenderingContext2D;
  script: VideoScript;
  time: number;
  opts: RenderOptions;
  getImage: ImageGetter;
  weather: Weather;
  w: number;
  h: number;
  seed: number;
}

export function drawFrame(args: FrameArgs) {
  const { ctx, script, time, opts, weather, w, h, seed } = args;
  const base = Math.min(w, h);

  ctx.save();
  ctx.fillStyle = "#04070d";
  ctx.fillRect(0, 0, w, h);

  const { shot, index, local, p } = getShotAt(script, time);
  const baseArgs = { w, h, getImage: args.getImage, seed, time };

  // crossfade from the outgoing plate
  const fade = 0.55;
  const prev = script.shots[index - 1];
  if (prev && local < fade) {
    ctx.globalAlpha = 1 - easeInOut(local / fade);
    drawBase(ctx, prev, 0.985, baseArgs);
    ctx.globalAlpha = 1;
  }
  drawBase(ctx, shot, p, baseArgs);

  drawWeather(ctx, weather, w, h, time, shot.sfx === "fire" ? "ember" : "snow");
  applyGrade(ctx, w, h, shot.grade);
  if (opts.bars) drawBars(ctx, w, h);
  if (opts.vignette) drawVignette(ctx, w, h, 0.5);
  if (opts.grain) drawGrain(ctx, w, h, 0.055);

  if (shot.kind === "title") {
    drawTitleCard(ctx, script, w, h, p, base);
  } else {
    if (opts.chapters && shot.first) drawLowerThird(ctx, shot, script.accent, w, h, local, base);
    if (opts.captions) drawCaption(ctx, shot, w, h, local, base);
  }
  const top = opts.bars ? h * 0.055 : h * 0.012;
  if (opts.bug) drawBug(ctx, script, w, h, time, top, base);
  if (opts.timecode) drawTimecode(ctx, script, w, h, time, top, base);
  drawProgress(ctx, script, time, w, h);

  ctx.restore();
}

/** Standalone 1280×720 (or given) cover art for the upload step. */
export function renderCoverArt(
  script: VideoScript,
  getImage: ImageGetter,
  w = 1280,
  h = 720,
): string | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const base = Math.min(w, h);

  const hero = script.shots[0]?.image;
  const img = hero ? getImage(hero) : null;
  if (img && img.naturalWidth > 0) {
    drawImageCover(ctx, img, w, h, { scale: 1.08, dx: 0.02, dy: 0 });
  } else {
    drawProcedural(ctx, w, h, 0, "cold", 1);
  }

  const scrim = ctx.createLinearGradient(0, 0, w * 0.75, h);
  scrim.addColorStop(0, "rgba(3,7,14,0.88)");
  scrim.addColorStop(0.55, "rgba(3,7,14,0.55)");
  scrim.addColorStop(1, "rgba(3,7,14,0.15)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);
  drawVignette(ctx, w, h, 0.4);

  ctx.textAlign = "left";
  const kicker = `${script.channelEmoji} ${script.channelName.toUpperCase()}`;
  const kickerSize = Math.min(base * 0.045, w * 0.03);
  ctx.font = `800 ${kickerSize}px ${SANS}`;
  ctx.fillStyle = script.accent;
  drawTracked(ctx, kicker, w * 0.07, h * 0.3, kickerSize * 0.18);

  const titleSize = Math.min(base * 0.16, w * 0.1);
  ctx.font = `900 ${titleSize}px ${SANS}`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = titleSize * 0.3;
  const lines = wrapLines(ctx, script.title, w * 0.62).slice(0, 3);
  lines.forEach((line, i) => {
    ctx.fillText(line, w * 0.07, h * 0.44 + i * titleSize * 1.06);
  });
  ctx.shadowBlur = 0;

  const ruleY = h * 0.44 + lines.length * titleSize * 1.06 + titleSize * 0.1;
  ctx.fillStyle = script.accent;
  ctx.fillRect(w * 0.07, ruleY, Math.min(w * 0.3, titleSize * 2.6), Math.max(3, titleSize * 0.05));

  const subSize = Math.min(base * 0.05, w * 0.032);
  ctx.font = `600 ${subSize}px ${SANS}`;
  ctx.fillStyle = "rgba(226,236,255,0.9)";
  wrapLines(ctx, script.subtitle, w * 0.6)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, w * 0.07, ruleY + subSize * 1.8 + i * subSize * 1.35));

  const badgeSize = Math.min(base * 0.036, w * 0.024);
  ctx.font = `800 ${badgeSize}px ${SANS}`;
  const badge = `${script.episode.split(" · ")[0]} · ${script.shots.length} SHOTS · ${fmt(
    script.duration,
  )}`;
  const bw = trackedWidth(ctx, badge, badgeSize * 0.16) + badgeSize * 2.4;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  roundRect(ctx, w * 0.07, h * 0.78, bw, badgeSize * 2.4, badgeSize * 1.2);
  ctx.fill();
  ctx.fillStyle = "#0a0f16";
  drawTracked(ctx, badge, w * 0.07 + badgeSize * 1.2, h * 0.78 + badgeSize * 1.62, badgeSize * 0.16);

  drawGrain(ctx, w, h, 0.05);
  try {
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function renderThumbnail(
  script: VideoScript,
  index: number,
  getImage: ImageGetter,
  w: number,
  h: number,
): string | null {
  const shot = script.shots[index];
  if (!shot) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = shot.image ? getImage(shot.image) : null;
  if (img && img.naturalWidth > 0) {
    drawImageCover(ctx, img, w, h, cameraFor(shot, 0.18));
  } else {
    drawProcedural(ctx, w, h, shot.start, shot.grade, index + 1);
  }
  applyGrade(ctx, w, h, shot.grade);
  drawVignette(ctx, w, h, 0.45);
  drawGrain(ctx, w, h, 0.05);
  try {
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
