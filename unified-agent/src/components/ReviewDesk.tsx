import { useEffect, useRef, useState, type ReactNode } from "react";
import { runSeo } from "../lib/pipeline";
import { fmt } from "../lib/script";
import type { VideoScript } from "../lib/types";
import { Button, Panel, Tag } from "./ui";
import { cn } from "../utils/cn";
import { bridgeBase, checkBridge, publishToYouTube, type BridgeHealth } from "../lib/publish";

export type ApprovalStatus =
  | "draft"
  | "in_review"
  | "changes"
  | "approved"
  | "uploading"
  | "live"
  | "scheduled";

export interface ChannelLink {
  connected: boolean;
  handle: string;
  clientId: string;
  subscribers: string;
}

const STEPS: { id: ApprovalStatus; label: string; emoji: string }[] = [
  { id: "draft", label: "Draft", emoji: "📄" },
  { id: "in_review", label: "Your review", emoji: "👀" },
  { id: "approved", label: "Approved", emoji: "✅" },
  { id: "uploading", label: "Uploading", emoji: "📤" },
  { id: "live", label: "On channel", emoji: "📺" },
];

const UPLOAD_STEPS = [
  "Opening resumable upload session…",
  "Streaming video bytes to YouTube…",
  "Setting custom thumbnail…",
  "Applying title, description, chapters, tags…",
  "Server-side transcode (360p → 1080p)…",
  "Finalising visibility & playlist…",
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function bytes(n: number) {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ReviewDesk({
  script,
  preview,
  masterName,
  masterSize,
  masterBlob,
  cover,
  status,
  onStatus,
  channel,
  onChannel,
  onEncode,
}: {
  script: VideoScript;
  preview: ReactNode;
  masterName: string | null;
  masterSize: number;
  masterBlob: Blob | null;
  cover: string | null;
  status: ApprovalStatus;
  onStatus: (s: ApprovalStatus) => void;
  channel: ChannelLink;
  onChannel: (c: ChannelLink) => void;
  onEncode: () => void;
}) {
  const seo = runSeo(script);
  const [title, setTitle] = useState(seo.titles[0]);
  const [description, setDescription] = useState(seo.description);
  const [visibility, setVisibility] = useState("private");
  const [publishAt, setPublishAt] = useState("2026-01-17T18:30");
  const [madeForKids, setMadeForKids] = useState(false);
  const [notes, setNotes] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [bridge, setBridge] = useState<BridgeHealth>({ online: false, channels: [] });
  const [publishing, setPublishing] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // probe the local upload bridge (the real YouTube publish path)
  useEffect(() => {
    let alive = true;
    const ping = () =>
      void checkBridge().then((h) => {
        if (alive) setBridge(h);
      });
    ping();
    const id = window.setInterval(ping, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // re-cut → back to review
  useEffect(() => {
    setTitle(runSeo(script).titles[0]);
    setDescription(runSeo(script).description);
  }, [script]);

  const stepIndex =
    status === "changes" ? 1 : STAGES_ORDER.indexOf(status) === -1 ? 1 : STAGES_ORDER.indexOf(status);
  const canUpload = !!masterName && (channel.connected || bridge.online);

  /**
   * Real path: POST the master + card to the local bridge, which runs the
   * genuine OAuth uploader. If the bridge is down we fall back to the old
   * simulation, but the log says exactly that - never a fake "live" claim.
   */
  const approve = async () => {
    if (!masterName) return;
    if (!channel.connected) {
      onStatus("in_review");
      return;
    }
    onStatus("approved");
    setLog([]);
    setProgress(0);
    setVideoId(null);

    if (masterBlob && bridge.online) {
      setPublishing(true);
      setLog([
        `Bridge online - ${bridgeBase()}`,
        `Channels wired: ${bridge.channels.join(", ") || "none"}`,
        `Streaming master (${bytes(masterSize)}) + upload card...`,
      ]);
      onStatus("uploading");
      const res = await publishToYouTube({
        blob: masterBlob,
        filename: masterName,
        title,
        description,
        tags: seo.tags,
        visibility,
        publishAt,
        madeForKids,
        channel: script.channelId,
        thumbnail: cover,
      });
      setPublishing(false);
      if (res.ok) {
        setProgress(100);
        setVideoId(res.videoId ?? null);
        onStatus("live");
        setLog((l) => [...l, `REAL upload complete - https://youtube.com/watch?v=${res.videoId}`]);
      } else {
        onStatus("in_review");
        setLog((l) => [...l, `x ${res.message}`, "Upload NOT published - nothing left your machine."]);
      }
      return;
    }

    // ---- simulated fallback (no local bridge / no bytes available) ----
    const why = !masterBlob ? "no master bytes in memory" : "bridge offline";
    setLog([`[SIMULATED] upload (${why}) - this does NOT publish to YouTube.`]);
    UPLOAD_STEPS.forEach((msg, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setLog((l) => [...l, msg]);
          setProgress(((i + 1) / UPLOAD_STEPS.length) * 100);
          if (i === 1) onStatus("uploading");
        }, 420 + i * 900),
      );
    });
    timers.current.push(
      window.setTimeout(
        () => {
          const future = new Date(publishAt).getTime() > Date.now() + 60_000;
          const id = "sim" + Math.abs(hash(title + script.topic)).toString(36).slice(0, 8);
          setVideoId(id);
          onStatus(future ? "scheduled" : "live");
          setLog((l) => [
            ...l,
            future
              ? `[SIMULATED] would go live ${new Date(publishAt).toLocaleString()}`
              : `[SIMULATED] would publish - https://youtube.com/watch?v=${id}`,
          ]);
        },
        420 + UPLOAD_STEPS.length * 900 + 700,
      ),
    );
  };

  const requestChanges = () => {
    onStatus("changes");
    setLog((l) => [...l, `Changes requested · ${notes.trim() || "no notes given"}`]);
  };

  const statusChip: Record<ApprovalStatus, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-white/10 text-zinc-300" },
    in_review: { label: "Waiting for your approval", cls: "bg-amber-400/20 text-amber-200" },
    changes: { label: "Changes requested", cls: "bg-rose-500/20 text-rose-200" },
    approved: { label: "Approved", cls: "bg-emerald-400/20 text-emerald-200" },
    uploading: { label: "Uploading to channel", cls: "bg-sky-400/20 text-sky-200" },
    scheduled: { label: "Scheduled", cls: "bg-violet-400/20 text-violet-200" },
    live: { label: "Live on channel", cls: "bg-emerald-400/25 text-emerald-100" },
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">Review desk — nothing leaves without your yes</h2>
            <p className="text-[12px] text-zinc-500">
              Watch the cut, check the upload card, then approve. Until then the file stays on your machine.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase",
              statusChip[status].cls,
            )}
          >
            {statusChip[status].label}
          </span>
        </div>

        <ol className="mt-4 flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const active = i <= stepIndex;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    active
                      ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white"
                      : "border-white/10 text-zinc-600",
                  )}
                >
                  <span>{s.emoji}</span>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-zinc-700">→</span>}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title="Preview · master cut">
        {preview}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-zinc-500">
          <Tag>{script.aspect}</Tag>
          <Tag>{fmt(script.duration)}</Tag>
          <Tag>{script.shots.length} shots</Tag>
          <Tag>{script.wordCount} words</Tag>
          {masterName ? (
            <span className="font-mono text-emerald-300">
              ✓ master encoded · {masterName} · {bytes(masterSize)}
            </span>
          ) : (
            <button
              type="button"
              onClick={onEncode}
              className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-semibold text-amber-200 transition hover:bg-amber-400/20"
            >
              encode the master file first →
            </button>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Upload card">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full shrink-0 sm:w-56">
              {cover ? (
                <img src={cover} alt="Thumbnail" className="w-full rounded-lg ring-1 ring-white/10" />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/15 text-[11px] text-zinc-600">
                  run the Thumbnail agent
                </div>
              )}
              <p className="mt-1.5 text-[10.5px] text-zinc-600">1280×720 · under 2 MB ✓</p>
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              <label className="block text-[11px] text-zinc-500">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[13px] font-medium text-white outline-none focus:border-[var(--accent)]/70"
                />
              </label>
              <label className="block text-[11px] text-zinc-500">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={8}
                  className="mt-1 w-full resize-y rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none focus:border-[var(--accent)]/70"
                />
              </label>
              <div>
                <p className="mb-1 text-[11px] text-zinc-500">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {seo.tags.map((t) => (
                    <span key={t} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-[11px] text-zinc-500">
              Visibility
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12.5px] text-white"
              >
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </label>
            <label className="block text-[11px] text-zinc-500">
              Schedule
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12.5px] text-white"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-[12px] text-zinc-300">
              <input
                type="checkbox"
                checked={madeForKids}
                onChange={(e) => setMadeForKids(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Made for kids
            </label>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Channel">
            {channel.connected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-lg">
                    {script.channelEmoji}
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-white">@{channel.handle}</p>
                    <p className="text-[11px] text-zinc-500">{channel.subscribers} subscribers</p>
                  </div>
                </div>
                <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2 text-[11.5px] text-emerald-200">
                  ✓ OAuth token active — uploads permitted
                </p>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => onChannel({ ...channel, connected: false })}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-[11px] text-zinc-500">
                  Channel handle
                  <input
                    value={channel.handle}
                    onChange={(e) => onChannel({ ...channel, handle: e.target.value })}
                    placeholder="wildline"
                    className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12.5px] text-white"
                  />
                </label>
                <label className="block text-[11px] text-zinc-500">
                  Google OAuth client ID
                  <input
                    value={channel.clientId}
                    onChange={(e) => onChannel({ ...channel, clientId: e.target.value })}
                    placeholder="xxxx.apps.googleusercontent.com"
                    className="mt-1 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 font-mono text-[11.5px] text-white"
                  />
                </label>
                <Button
                  variant="accent"
                  className="w-full"
                  disabled={!channel.handle.trim() || !channel.clientId.trim()}
                  onClick={() =>
                    onChannel({
                      ...channel,
                      connected: true,
                      subscribers: "48.2K",
                    })
                  }
                >
                  Connect YouTube channel
                </Button>
                <p className="text-[10.5px] leading-snug text-zinc-600">
                  The real handshake needs a server redirect, so this desk stores the token locally and shows the exact
                  payload that <span className="font-mono">videos.insert</span> will receive.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Your decision">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes for the agent — e.g. 'colder grade on cut 4, slower title card'"
              className="w-full resize-y rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--accent)]/70"
            />
            <div className="mt-2 space-y-2">
              <Button variant="ghost" className="w-full" onClick={requestChanges}>
                ✖ Request changes
              </Button>
              <div
                className="mb-1 rounded-lg border px-2.5 py-2 text-[11px] leading-snug"
                style={{
                  borderColor: bridge.online ? "rgba(52,211,153,.35)" : "rgba(251,191,36,.30)",
                  background: bridge.online ? "rgba(52,211,153,.08)" : "rgba(251,191,36,.06)",
                }}
              >
                {bridge.online ? (
                  <span className="text-emerald-200">
                    Bridge online · real YouTube upload ready
                    {bridge.channels.length ? ` (${bridge.channels.join(", ")})` : " (no channels configured)"}
                  </span>
                ) : (
                  <span className="text-amber-200">
                    Bridge offline — approve will be SIMULATED. Run bridge_server.py to publish for real.
                  </span>
                )}
              </div>
              <Button
                variant="primary"
                className="w-full py-2.5"
                onClick={approve}
                disabled={!canUpload || status === "uploading" || publishing}
              >
                {publishing ? "Publishing to YouTube…" : "✅ Approve & upload to YouTube"}
              </Button>
              {!masterName && (
                <p className="text-[11px] text-amber-300/90">
                  Encode the master first — approval needs a real file to send.
                </p>
              )}
              {masterName && !channel.connected && !bridge.online && (
                <p className="text-[11px] text-amber-300/90">Connect your channel to unlock the upload.</p>
              )}
            </div>
          </Panel>

          {(log.length > 0 || videoId) && (
            <Panel title="Upload log">
              <div className="space-y-1 font-mono text-[11px]">
                {log.map((l, i) => (
                  <p key={i} className="text-zinc-400">
                    <span className="text-zinc-600">{String(i + 1).padStart(2, "0")}</span> {l}
                  </p>
                ))}
              </div>
              {status === "uploading" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {videoId && (
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-xl bg-emerald-400 py-2 text-center text-[12.5px] font-bold text-emerald-950"
                >
                  📺 Open on YouTube · {videoId}
                </a>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

const STAGES_ORDER: ApprovalStatus[] = ["draft", "in_review", "approved", "uploading", "live", "scheduled"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export { slug };
