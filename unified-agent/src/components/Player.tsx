import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ASPECTS, type EngineState, type VideoEngine } from "../lib/engine";
import { fmt } from "../lib/script";
import { supportsRecording } from "../lib/recorder";
import type { ExportJob, VideoScript } from "../lib/types";
import { Button, Tag } from "./ui";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function Player({
  engine,
  canvasRef,
  stageRef,
  state,
  script,
  volume,
  job,
  onToggle,
  onSeek,
  onRestart,
  onVolume,
  onExport,
  onCancelExport,
  onSrt,
  onNarration,
  overlay,
}: {
  engine: VideoEngine | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  state: EngineState;
  script: VideoScript;
  volume: number;
  job: ExportJob;
  overlay?: { label: string; step: number; total: number } | null;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onRestart: () => void;
  onVolume: (v: number) => void;
  onExport: () => void;
  onCancelExport: () => void;
  onSrt: () => void;
  onNarration: () => void;
}) {
  const dragging = useRef(false);

  // the canvas can be remounted when switching views — keep the engine bound to it
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    engine.attach(canvas);
    engine.render();
    return () => engine.detach();
  }, [engine]);

  const aspect = ASPECTS[script.aspect];
  const progress = state.duration > 0 ? state.time / state.duration : 0;
  const recording = job.status === "recording";
  const canRecord = supportsRecording();

  const scrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(clamp((e.clientX - rect.left) / rect.width, 0, 1) * state.duration);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080b11] shadow-[0_40px_90px_-50px_rgba(0,0,0,1)]">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
          <span className="text-[13px] font-semibold text-white">{script.title}</span>
          <Tag accent>{script.channelEmoji + " " + script.channelName}</Tag>
        </div>
        <div className="flex items-center gap-1.5">
          <Tag>{aspect.label}</Tag>
          <Tag>{fmt(state.duration)}</Tag>
          <Tag>{script.shots.length} shots</Tag>
        </div>
      </div>

      {/* stage */}
      <div ref={stageRef} className="relative bg-black">
        <div className="mx-auto flex max-h-[62vh] items-center justify-center p-3">
          <div
            className="relative w-full overflow-hidden rounded-xl ring-1 ring-white/10"
style={{ aspectRatio: aspect.ratio, maxWidth: script.aspect === "9:16" ? "calc(56vh * 9 / 16)" : "100%" }}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ imageRendering: "auto" }}
            />

            {/* loading veil */}
            {state.ready < 1 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
                <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${Math.round(state.ready * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">
                  decoding plates {Math.round(state.ready * 100)}%
                </span>
              </div>
            )}

            {/* big play */}
            {!state.playing && state.ready >= 1 && (
              <button
                type="button"
                onClick={onToggle}
                aria-label="Play"
                className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-transparent to-black/25 transition"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}

            {overlay && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm">
                <span className="font-mono text-[11px] tracking-[0.3em] text-[var(--accent)] uppercase">
                  compositing
                </span>
                <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
                    style={{ width: `${((overlay.step + 1) / overlay.total) * 100}%` }}
                  />
                </div>
                <span className="text-[12.5px] font-medium text-zinc-200">{overlay.label}…</span>
              </div>
            )}

            {recording && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                <span className="font-mono text-[11px] font-bold tracking-widest text-rose-200 uppercase">
                  rec · encoding {Math.round(progress * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* transport */}
      <div className="border-t border-white/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={state.playing ? "Pause" : "Play"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition hover:scale-105"
          >
            {state.playing ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label="Restart"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 text-zinc-300 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />
            </svg>
          </button>

          <span className="shrink-0 font-mono text-[12px] text-zinc-400 tabular-nums">
            {fmt(state.time)} <span className="text-zinc-600">/ {fmt(state.duration)}</span>
          </span>

          <div className="relative flex-1 py-3">
            <div
              role="slider"
              aria-label="Seek"
              tabIndex={0}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                scrub(e);
              }}
              onPointerMove={(e) => {
                if (dragging.current) scrub(e);
              }}
              onPointerUp={(e) => {
                dragging.current = false;
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              className="group relative h-1.5 w-full cursor-pointer rounded-full bg-white/12"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition group-hover:opacity-100"
                style={{ left: `${progress * 100}%` }}
              />
              {script.shots.slice(1).map((s) => (
                <span
                  key={s.id}
                  className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 bg-black/45"
                  style={{ left: `${(s.start / state.duration) * 100}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onVolume(volume > 0 ? 0 : 0.75)}
              aria-label="Mute"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 text-zinc-300 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M4 10v4h3l4 4V6L7 10H4z" />
                {volume > 0 ? (
                  <path d="M15 8.5a4.5 4.5 0 0 1 0 7v-1.6a3 3 0 0 0 0-3.8z" />
                ) : (
                  <path d="M15.5 9l4.5 4.5-1 1L14.5 10zM19 9l-1 1-4.5 4.5 1 1L19 10z" />
                )}
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/12 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <button
              type="button"
              onClick={() => {
                const el = stageRef.current;
                if (!el) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el.requestFullscreen?.();
              }}
              aria-label="Fullscreen"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 text-zinc-300 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-zinc-500">
          <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-zinc-400">{state.chapter}</span>
          <span className="truncate">
            {engine ? "space play · ← → scrub · m mute · f fullscreen" : "initialising renderer…"}
          </span>
        </div>
      </div>

      {/* export */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 bg-black/40 px-4 py-3">
        {recording ? (
          <>
            <Button variant="danger" onClick={onCancelExport}>
              <span className="h-2 w-2 rounded-full bg-rose-300" /> Stop &amp; finalise
            </Button>
            <span className="text-[12px] text-zinc-400">
              Encoding in real time — keep this tab in the foreground.
            </span>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onExport} disabled={!canRecord || state.ready < 1}>
              ⬇ Export video file
            </Button>
            <Button onClick={onSrt}>.srt captions</Button>
            <Button onClick={onNarration}>Copy script</Button>
          </>
        )}

        {job.status === "done" && job.url && (
          <a
            href={job.url}
            download={job.name}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2 text-[13px] font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            ⬇ {job.name} · {bytes(job.size ?? 0)}
          </a>
        )}
        {job.status === "done" && !canRecord && (
          <span className="text-[12px] text-amber-300">This browser cannot encode video files.</span>
        )}
        {job.status === "error" && <span className="text-[12px] text-rose-300">{job.error}</span>}
      </div>
    </div>
  );
}
