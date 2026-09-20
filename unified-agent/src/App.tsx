import { useCallback, useEffect, useRef, useState } from "react";
import { BriefPanel } from "./components/BriefPanel";
import { Player } from "./components/Player";
import { Storyboard } from "./components/Storyboard";
import { VideoEngine, type EngineState } from "./lib/engine";
import { AgentOps } from "./components/AgentOps";
import { ReviewDesk, type ApprovalStatus, type ChannelLink } from "./components/ReviewDesk";
import { VideoRecorder, type RecordedVideo } from "./lib/recorder";
import { buildScript, getChannel, toNarration, toSrt } from "./lib/script";
import type { Brief, ExportJob, RenderOptions, VideoScript } from "./lib/types";
import { Tag } from "./components/ui";

const DEFAULT_BRIEF: Brief = {
  topic: "Frozen survival shelter",
  channelId: "bushcraft",
  pacing: "standard",
  aspect: "16:9",
  seed: 1,
};

const DEFAULT_OPTS: RenderOptions = {
  captions: true,
  chapters: true,
  grain: true,
  vignette: true,
  bars: true,
  timecode: true,
  bug: true,
  sound: true,
  voice: false,
};

const STEPS = ["Reading the brief", "Writing narration", "Boarding shots", "Grading & mixing ambience"];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "video";

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};

export default function App() {
  const [brief, setBrief] = useState<Brief>(DEFAULT_BRIEF);
  const [opts, setOpts] = useState<RenderOptions>(DEFAULT_OPTS);
  const [script, setScript] = useState<VideoScript>(() => buildScript(DEFAULT_BRIEF));
  const [state, setState] = useState<EngineState>({
    time: 0,
    playing: false,
    duration: script.duration,
    ready: 0,
    chapter: "Title",
  });
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"studio" | "agents" | "review">("studio");
  const [approval, setApproval] = useState<ApprovalStatus>("draft");
  const [yt, setYt] = useState<ChannelLink>({
    connected: false,
    handle: "wildline",
    clientId: "",
    subscribers: "—",
  });
  const [cover, setCover] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [volume, setVolume] = useState(0.75);
  const [job, setJob] = useState<ExportJob>({ status: "idle", progress: 0 });
  const [copied, setCopied] = useState(false);
  const [masterBlob, setMasterBlob] = useState<Blob | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VideoEngine | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);
  const timers = useRef<number[]>([]);
  const scriptRef = useRef(script);
  scriptRef.current = script;

  const channel = getChannel(script.channelId);

  /* ------------------------------------------------------------- exports */

  const finishExport = useCallback((video: RecordedVideo) => {
    const s = scriptRef.current;
    const name = `${slug(s.topic)}-${s.channelId}-${s.aspect.replace(":", "x")}.${video.extension}`;
    setMasterBlob(video.blob);
    setJob({ status: "done", progress: 1, url: video.url, size: video.size, seconds: video.seconds, name });
    try {
      const a = document.createElement("a");
      a.href = video.url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* user can still click the link */
    }
  }, []);

  const startExport = useCallback(async () => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    setJob({ status: "recording", progress: 0 });
    engine.seek(0);
    await engine.play();
    try {
      const rec = new VideoRecorder(canvas, engine.audio.stream);
      recorderRef.current = rec;
      rec.start();
    } catch (err) {
      recorderRef.current = null;
      setJob({
        status: "error",
        progress: 0,
        error: err instanceof Error ? err.message : "This browser refused to encode the canvas.",
      });
    }
  }, []);

  const cancelExport = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    engineRef.current?.pause();
    finishExport(await rec.stop());
  }, [finishExport]);

  /* ------------------------------------------------------------- engine */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new VideoEngine(scriptRef.current, opts);
    engine.attach(canvas);
    engineRef.current = engine;
    const unsub = engine.subscribe(setState);
    engine.onEnded = () => {
      const rec = recorderRef.current;
      if (!rec) return;
      recorderRef.current = null;
      void rec.stop().then(finishExport);
    };
    return () => {
      unsub();
      engine.onEnded = null;
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setScript(script);
    setThumbs([]);
    const size =
      script.aspect === "9:16"
        ? { w: 180, h: 320 }
        : script.aspect === "1:1"
          ? { w: 300, h: 300 }
          : { w: 320, h: 180 };
    const thumbId = window.setTimeout(() => {
      setThumbs(engine.thumbnails(size.w, size.h));
      setCover(engine.coverArt(1280, 720));
    }, 320);
    const playId = window.setTimeout(() => void engine.play(), 460);
    return () => {
      window.clearTimeout(thumbId);
      window.clearTimeout(playId);
    };
  }, [script]);

  // browsers block audio until a gesture — unlock on the first interaction
  useEffect(() => {
    const kick = () => void engineRef.current?.audio.resume();
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setOpts(opts);
  }, [opts]);

  // aspect is a pure canvas property — apply it without a full rebuild
  useEffect(() => {
    setScript((s) => (s.aspect === brief.aspect ? s : { ...s, aspect: brief.aspect }));
  }, [brief.aspect]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* ---------------------------------------------------------- generation */

  const generate = useCallback(
    (override?: Partial<Brief>) => {
    // every run rolls a new cut, even for an unchanged brief
    const seed = (override?.seed ?? brief.seed) + 1;
    const next = buildScript({ ...brief, ...override, seed });
    patchBrief({ seed });
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setBusy(true);
    setJob({ status: "idle", progress: 0 });
    STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStep(i), i * 220));
    });
    timers.current.push(
      window.setTimeout(
        () => {
          setScript(next);
          setBusy(false);
          setStep(-1);
          setApproval("in_review");
          const engine = engineRef.current;
          if (engine) {
            engine.seek(0);
            void engine.play();
          }
        },
        STEPS.length * 220 + 240,
      ),
    );
    },
    [brief],
  );

  const patchBrief = (patch: Partial<Brief>) => setBrief((b) => ({ ...b, ...patch }));
  const patchOpts = (patch: Partial<RenderOptions>) => setOpts((o) => ({ ...o, ...patch }));

  /* ---------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const engine = engineRef.current;
      if (!engine) return;
      if (e.code === "Space") {
        e.preventDefault();
        void engine.toggle();
      } else if (e.code === "ArrowRight") {
        engine.nudge(5);
      } else if (e.code === "ArrowLeft") {
        engine.nudge(-5);
      } else if (e.key.toLowerCase() === "m") {
        setVolume((v) => (v > 0 ? 0 : 0.75));
      } else if (e.key.toLowerCase() === "f") {
        void stageRef.current?.requestFullscreen?.();
      } else if (e.key.toLowerCase() === "r") {
        engine.seek(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeIndex = script.shots.reduce((acc, shot, i) => (state.time + 0.001 >= shot.start ? i : acc), 0);

  const playerNode = (
    <Player
      engine={engineRef.current}
      canvasRef={canvasRef}
      stageRef={stageRef}
      state={state}
      script={script}
      volume={volume}
      job={job}
      onToggle={() => void engineRef.current?.toggle()}
      onSeek={(t) => engineRef.current?.seek(t)}
      onRestart={() => engineRef.current?.seek(0)}
      onVolume={setVolume}
      onExport={() => void startExport()}
      onCancelExport={() => void cancelExport()}
      onSrt={() =>
        downloadBlob(new Blob([toSrt(script)], { type: "application/x-subrip" }), `${slug(script.topic)}.srt`)
      }
      onNarration={() => {
        void navigator.clipboard
          ?.writeText(toNarration(script))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => setCopied(false));
      }}
      overlay={busy ? { label: STEPS[Math.max(0, step)], step: Math.max(0, step), total: STEPS.length } : null}
    />
  );

  const makeCover = () => {
    const art = engineRef.current?.coverArt(1280, 720) ?? null;
    setCover(art);
    return art;
  };

  return (
    <div
      className="min-h-screen bg-[#05070b] text-zinc-200 antialiased"
      style={{ ["--accent" as string]: script.accent }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 500px at 12% -5%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%), radial-gradient(700px 400px at 95% 8%, rgba(80,140,255,0.14), transparent 70%)",
        }}
      />

      <header className="relative mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-xl shadow-[0_14px_40px_-14px_var(--accent)]">
            🎬
          </div>
          <div>
            <h1 className="text-[19px] leading-tight font-bold tracking-tight text-white">
              Wildline <span className="text-[var(--accent)]">Studio</span>
            </h1>
            <p className="text-[12px] text-zinc-500">
              One brief in · one cut video out — rendered live in your browser
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag accent>
            {channel.emoji} {channel.name}
          </Tag>
          <Tag>{channel.series}</Tag>
          <Tag>{script.episode.split(" · ")[0]}</Tag>
          <Tag accent>cut #{script.seed}</Tag>
          <span
            className={
              approval === "live"
                ? "rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-200 uppercase"
                : approval === "in_review" || approval === "changes"
                  ? "rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-200 uppercase"
                  : "rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase"
            }
          >
            {approval === "in_review"
              ? "awaiting approval"
              : approval === "changes"
                ? "changes requested"
                : approval === "uploading"
                  ? "uploading"
                  : approval === "scheduled"
                    ? "scheduled"
                    : approval === "live"
                      ? "live"
                      : "draft"}
          </span>
          <span className="hidden text-[12px] text-zinc-500 sm:inline">{channel.tagline}</span>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1560px] px-5 pb-14">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              { id: "studio", label: "🎬 Studio", note: "brief → film" },
              { id: "agents", label: "🧠 Agent Ops", note: "10-agent pipeline" },
              { id: "review", label: "🛡️ Review & Publish", note: "approve → upload" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={
                view === tab.id
                  ? "rounded-xl border border-[var(--accent)]/70 bg-[var(--accent)]/15 px-3.5 py-2 text-[13px] font-semibold text-white"
                  : "rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-zinc-400 transition hover:border-white/25 hover:text-zinc-100"
              }
            >
              {tab.label}
              <span className="ml-2 text-[11px] font-normal text-zinc-500">{tab.note}</span>
            </button>
          ))}
        </div>

        {view === "studio" && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)_310px]">
        <BriefPanel
          brief={brief}
          opts={opts}
          script={script}
          busy={busy}
          stale={
            brief.topic !== script.topic ||
            brief.pacing !== script.pacing ||
            brief.channelId !== script.channelId
          }
          onChange={patchBrief}
          onOpts={patchOpts}
          onGenerate={() => generate()}
          onReroll={() => generate()}
        />

        <div className="space-y-4">
          {playerNode}

          {copied && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-200">
              Full narration script copied to clipboard — paste it into your upload description.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                t: "Live canvas render",
                d: "Every frame is drawn on a 2D canvas: camera moves, colour grade, grain, drifting snow and embers.",
              },
              {
                t: "Synthesised score",
                d: "Wind gusts, fire crackle and a low drone are generated with the Web Audio API — zero assets.",
              },
              {
                t: "Real file out",
                d: "MediaRecorder captures canvas + ambience into a downloadable video with matching .srt captions.",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
                <h3 className="mb-1 text-[12px] font-bold tracking-wide text-white">{c.t}</h3>
                <p className="text-[11.5px] leading-relaxed text-zinc-500">{c.d}</p>
              </div>
            ))}
          </div>
        </div>

        <Storyboard
          script={script}
          thumbs={thumbs}
          activeIndex={activeIndex}
          onSelect={(i) => engineRef.current?.jumpToShot(i)}
        />
        </div>
        )}

        {view === "review" && (
          <ReviewDesk
            script={script}
            preview={playerNode}
            masterName={job.status === "done" ? (job.name ?? null) : null}
            masterSize={job.size ?? 0}
            masterBlob={masterBlob}
            cover={cover}
            status={approval}
            onStatus={setApproval}
            channel={yt}
            onChannel={setYt}
            onEncode={() => {
              if (!cover) makeCover();
              void startExport();
            }}
          />
        )}

        {view === "agents" && (
          <AgentOps
            engine={engineRef.current}
            script={script}
            thumbs={thumbs}
            onUseIdea={(topic) => {
              patchBrief({ topic });
              setView("studio");
              generate({ topic });
            }}
            onPlay={() => void engineRef.current?.toggle()}
            onExport={() => void startExport()}
            onOpenReview={() => setView("review")}
            onRecut={() => generate()}
          />
        )}
      </main>

      <footer className="relative mx-auto max-w-[1560px] px-5 pb-8 text-[11px] text-zinc-600">
        Wildline Studio · procedural video synthesis · no footage, no uploads, everything runs on-device
      </footer>
    </div>
  );
}
