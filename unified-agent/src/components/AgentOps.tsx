import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoEngine } from "../lib/engine";
import {
  buildUploadPackage,
  runAnalytics,
  runIdeas,
  runResearch,
  runSeo,
  STAGES,
  STAGE_BY_ID,
  type Analytics,
  type ResearchNote,
  type SeoPackage,
  type StageId,
  type StageStatus,
  type UploadPackage,
} from "../lib/pipeline";
import { fmt } from "../lib/script";
import type { VideoScript } from "../lib/types";
import { Button, Panel, Tag } from "./ui";
import { cn } from "../utils/cn";

type Log = { id: number; stage: StageId; msg: string };

const statusRing: Record<StageStatus, string> = {
  idle: "border-white/12 text-zinc-500",
  running: "border-[var(--accent)]/70 text-[var(--accent)]",
  done: "border-emerald-400/60 text-emerald-300",
};

function Bar({ value, max, accent }: { value: number; max: number; accent?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cn("h-full rounded-full", accent ? "bg-[var(--accent)]" : "bg-sky-400/80")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function AgentOps({
  engine,
  script,
  thumbs,
  onUseIdea,
  onPlay,
  onExport,
  onOpenReview,
  onRecut,
}: {
  engine: VideoEngine | null;
  script: VideoScript;
  thumbs: string[];
  onUseIdea: (topic: string) => void;
  onPlay: () => void;
  onExport: () => void;
  onOpenReview: () => void;
  onRecut: () => void;
}) {
  const [status, setStatus] = useState<Record<StageId, StageStatus>>(() =>
    STAGES.reduce((acc, s) => ({ ...acc, [s.id]: "idle" }), {} as Record<StageId, StageStatus>),
  );
  const [log, setLog] = useState<Log[]>([]);
  const [running, setRunning] = useState(false);
  const [research, setResearch] = useState<ResearchNote | null>(null);
  const [seo, setSeo] = useState<SeoPackage | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [pkg, setPkg] = useState<UploadPackage | null>(null);
  const [publishAt, setPublishAt] = useState("2026-01-17T18:30");
  const [visibility, setVisibility] = useState("private");
  const [copied, setCopied] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const logId = useRef(0);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const push = (stage: StageId, msg: string) =>
    setLog((l) => [...l.slice(-40), { id: logId.current++, stage, msg }]);

  const doneCount = STAGES.filter((s) => status[s.id] === "done").length;

  const finishStage = (id: StageId, message: string) => {
    setStatus((s) => ({ ...s, [id]: "done" }));
    push(id, message);
    if (id === "research") setResearch(runResearch(script));
    if (id === "seo") setSeo(runSeo(script));
    if (id === "analytics") setAnalytics(runAnalytics(script));
    if (id === "ideas") setIdeas(runIdeas(script));
    if (id === "thumbnail") setCover(engine?.coverArt(1280, 720) ?? null);
    if (id === "publish") setPkg(buildUploadPackage(script, runSeo(script), "webm", publishAt, visibility));
  };

  const runStage = (id: StageId, delay = 0) => {
    const def = STAGE_BY_ID[id];
    setStatus((s) => ({ ...s, [id]: "running" }));
    push(id, `${def.agent} started · ${def.name.toLowerCase()}`);
    timers.current.push(
      window.setTimeout(() => finishStage(id, `${def.agent} finished · ${def.name.toLowerCase()} ✓`), def.ms + delay),
    );
  };

  const runAll = () => {
    if (running) return;
    setRunning(true);
    setLog([]);
    onRecut(); // the pipeline always delivers a brand new cut
    STAGES.forEach((s, i) => runStage(s.id, i * 180));
    timers.current.push(
      window.setTimeout(() => setRunning(false), STAGES.reduce((n, s) => n + s.ms, 0) + STAGES.length * 180 + 120),
    );
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const seoNow = useMemo(() => seo ?? runSeo(script), [seo, script]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">AI Command Center</h2>
            <p className="text-[12px] text-zinc-500">
              Ten specialised agents turn one brief into an upload-ready package.{" "}
              <span className="text-zinc-400">
                {doneCount}/{STAGES.length} stages complete
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => STAGES.forEach((s) => setStatus((p) => ({ ...p, [s.id]: "idle" })))}>
              Reset
            </Button>
            <Button variant="accent" onClick={runAll} disabled={running}>
              {running ? "Agents working…" : "⚡ Run full pipeline"}
            </Button>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${(doneCount / STAGES.length) * 100}%` }}
          />
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STAGES.map((stage) => (
          <Panel
            key={stage.id}
            className={cn(
              "transition",
              status[stage.id] === "running" && "border-[var(--accent)]/50 bg-[var(--accent)]/[0.06]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{stage.emoji}</span>
                <div>
                  <h3 className="text-[13px] font-bold text-white">{stage.name}</h3>
                  <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                    agent · {stage.agent}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-widest uppercase",
                  statusRing[status[stage.id]],
                  status[stage.id] === "running" && "animate-pulse",
                )}
              >
                {status[stage.id]}
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">{stage.blurb}</p>

            <div className="mt-3 space-y-2">
              {stage.id === "research" && research && (
                <div className="space-y-2 text-[11.5px] text-zinc-400">
                  <p>
                    <span className="text-zinc-200">Intent:</span> {research.intent}
                  </p>
                  <p>
                    <span className="text-zinc-200">Audience:</span> {research.audience}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {research.keywords.slice(0, 5).map((k) => (
                      <span key={k} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="text-amber-300/90">⚠ {research.risk}</p>
                </div>
              )}

              {stage.id === "script" && (
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {[
                    { k: "shots", v: script.shots.length },
                    { k: "runtime", v: fmt(script.duration) },
                    { k: "words", v: script.wordCount },
                  ].map((s) => (
                    <div key={s.k} className="rounded-lg border border-white/8 bg-black/30 py-1.5">
                      <div className="font-mono text-[13px] font-bold text-white">{s.v}</div>
                      <div className="text-[9px] tracking-wider text-zinc-500 uppercase">{s.k}</div>
                    </div>
                  ))}
                </div>
              )}

              {stage.id === "voice" && (
                <div className="space-y-2">
                  <p className="text-[11.5px] text-zinc-400">
                    Narrator cast: <span className="text-zinc-200">calm baritone, 1.03× pace</span> — rendered by your
                    device's speech engine, so the read stays on-machine.
                  </p>
                  <Button onClick={onPlay} className="w-full">
                    ▶ Preview the read
                  </Button>
                </div>
              )}

              {stage.id === "visuals" && (
                <div className="flex flex-wrap gap-1">
                  {["plates assigned", "camera moves", "colour grade", "snow & embers"].map((v) => (
                    <Tag key={v}>{v}</Tag>
                  ))}
                </div>
              )}

              {stage.id === "publish" && pkg && (
                <Button variant="ghost" className="w-full" onClick={onOpenReview}>
                  🛡️ Open review desk for approval
                </Button>
              )}

              {stage.id === "assembly" && (
                <div className="space-y-2">
                  <p className="text-[11.5px] text-zinc-400">
                    {script.shots.length} cuts · {fmt(script.duration)} · {script.aspect} · ambience mixed per scene.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={onPlay} className="flex-1">
                      ▶ Play film
                    </Button>
                    <Button variant="primary" onClick={onExport} className="flex-1">
                      ⬇ Encode
                    </Button>
                  </div>
                </div>
              )}

              {stage.id === "thumbnail" && (
                <div className="space-y-2">
                  {cover ? (
                    <>
                      <img src={cover} alt="Cover art" className="w-full rounded-lg ring-1 ring-white/10" />
                      <a
                        href={cover}
                        download={`cover-${script.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
                        className="block rounded-xl bg-white/90 py-2 text-center text-[12px] font-bold text-zinc-900"
                      >
                        ⬇ Download 1280×720 cover
                      </a>
                    </>
                  ) : (
                    <p className="text-[11.5px] text-zinc-500">
                      Run this agent to compose cover art from the hero plate.
                    </p>
                  )}
                </div>
              )}

              {stage.id === "seo" && seo && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {seoNow.titles.slice(0, 3).map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => copy("title", t)}
                        className={cn(
                          "block w-full rounded-lg border px-2 py-1.5 text-left text-[11.5px] transition",
                          i === 0
                            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-white"
                            : "border-white/8 bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {seo.tags.slice(0, 6).map((t) => (
                      <span key={t} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        #{t}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => copy("description", seo.description)}>
                      Copy description
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() =>
                        download(
                          `${script.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-description.txt`,
                          seo.description,
                          "text/plain",
                        )
                      }
                    >
                      .txt
                    </Button>
                  </div>
                </div>
              )}

              {stage.id === "publish" && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-zinc-500">
                    Publish at
                    <input
                      type="datetime-local"
                      value={publishAt}
                      onChange={(e) => setPublishAt(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[12px] text-white"
                    />
                  </label>
                  <div className="flex gap-1.5">
                    {["private", "unlisted", "public"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVisibility(v)}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition",
                          visibility === v
                            ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white"
                            : "border-white/10 text-zinc-400",
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {pkg ? (
                    <div className="space-y-1.5">
                      <p className="font-mono text-[10.5px] break-all text-zinc-400">{pkg.file}</p>
                      <Button
                        className="w-full"
                        onClick={() =>
                          download(
                            `upload-${script.channelId}.json`,
                            JSON.stringify(pkg, null, 2),
                            "application/json",
                          )
                        }
                      >
                        ⬇ Download upload package (.json)
                      </Button>
                      <p className="text-[10.5px] leading-snug text-zinc-600">
                        Wire the YouTube Data API v3 <span className="font-mono">videos.insert</span> endpoint with an
                        OAuth token in your backend to push this package straight to the channel — Bilibili joins the
                        same queue next.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11.5px] text-zinc-500">
                      Queue the deliverable, title, description and schedule for the channel.
                    </p>
                  )}
                </div>
              )}

              {stage.id === "analytics" && analytics && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[
                      { k: "14d views", v: analytics.projectedViews.toLocaleString() },
                      { k: "CTR", v: `${analytics.ctr}%` },
                      { k: "new subs", v: analytics.subs.toLocaleString() },
                    ].map((s) => (
                      <div key={s.k} className="rounded-lg border border-white/8 bg-black/30 py-1.5">
                        <div className="font-mono text-[12.5px] font-bold text-white">{s.v}</div>
                        <div className="text-[9px] tracking-wider text-zinc-500 uppercase">{s.k}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {analytics.days.slice(0, 8).map((d) => (
                      <div key={d.d} className="flex items-center gap-2">
                        <span className="w-6 font-mono text-[10px] text-zinc-600">{d.d}</span>
                        <Bar value={d.views} max={Math.max(...analytics.days.map((x) => x.views))} accent />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Retention cliff at {fmt(script.duration * 0.35)} — peak re-watch moment{" "}
                    <span className="text-zinc-300">{analytics.bestMoment}</span>
                  </p>
                </div>
              )}

              {stage.id === "ideas" && (
                <div className="flex flex-wrap gap-1.5">
                  {(ideas.length ? ideas : runIdeas(script)).map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => onUseIdea(idea)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-[var(--accent)]/60 hover:text-white"
                    >
                      {idea} →
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3">
              <Button
                variant="ghost"
                className="w-full py-1.5 text-[12px]"
                disabled={status[stage.id] === "running"}
                onClick={() => runStage(stage.id)}
              >
                {status[stage.id] === "done" ? "↻ Re-run agent" : "Run agent"}
              </Button>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Agent log">
          <div className="max-h-52 space-y-1 overflow-y-auto font-mono text-[11px]">
            {log.length === 0 && <p className="text-zinc-600">idle — run the pipeline to see agent traffic.</p>}
            {log.map((l) => (
              <p key={l.id} className="flex gap-2">
                <span className="text-zinc-600">{String(l.id + 1).padStart(2, "0")}</span>
                <span className="text-[var(--accent)]">{STAGE_BY_ID[l.stage].agent}</span>
                <span className="text-zinc-400">{l.msg}</span>
              </p>
            ))}
          </div>
        </Panel>

        <Panel title="Deliverables">
          <ul className="space-y-1.5 text-[11.5px] text-zinc-400">
            {[
              { k: "Master video", v: `${script.aspect} · ${fmt(script.duration)}`, ok: true },
              { k: "Captions", v: ".srt per shot", ok: true },
              { k: "Narration script", v: `${script.wordCount} words`, ok: true },
              { k: "Cover art", v: cover ? "1280×720 png" : "pending", ok: !!cover },
              { k: "Plates", v: `${thumbs.filter(Boolean).length}/${script.shots.length} boarded`, ok: true },
              { k: "Upload package", v: pkg ? "ready" : "pending", ok: !!pkg },
            ].map((row) => (
              <li key={row.k} className="flex items-center justify-between gap-2 border-b border-white/6 pb-1.5">
                <span>{row.k}</span>
                <span className={cn("font-mono text-[11px]", row.ok ? "text-emerald-300" : "text-zinc-600")}>
                  {row.ok ? "✓" : "○"} {row.v}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10.5px] leading-snug text-zinc-600">
            Everything above is produced locally in this tab — research is templated from your brief, analytics are a
            projection, and publishing waits on your YouTube API credentials.
          </p>
        </Panel>
      </div>

      {copied && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-zinc-900 shadow-xl">
          {copied} copied
        </div>
      )}
    </div>
  );
}
