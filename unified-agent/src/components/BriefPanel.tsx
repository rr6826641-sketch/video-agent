import { CHANNELS, PACING } from "../lib/script";
import type { Aspect, Brief, Pacing, RenderOptions, VideoScript } from "../lib/types";
import { fmt } from "../lib/script";
import { Button, Panel, Segmented, Toggle } from "./ui";

const TOPIC_IDEAS = [
  "Frozen survival shelter",
  "Fire by friction in deep snow",
  "Seven nights alone at -30",
  "Reading a river under ice",
];

export function BriefPanel({
  brief,
  opts,
  script,
  busy,
  stale,
  onChange,
  onOpts,
  onGenerate,
  onReroll,
}: {
  brief: Brief;
  opts: RenderOptions;
  script: VideoScript;
  busy: boolean;
  stale?: boolean;
  onChange: (patch: Partial<Brief>) => void;
  onOpts: (patch: Partial<RenderOptions>) => void;
  onGenerate: () => void;
  onReroll: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Brief">
        <label className="mb-1 block px-2 text-[12px] font-medium text-zinc-400">Video topic</label>
        <input
          value={brief.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
          placeholder="e.g. Frozen survival shelter"
          className="mb-2 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2.5 text-[14px] font-medium text-white outline-none transition placeholder:text-zinc-600 focus:border-[var(--accent)]/70"
        />
        <div className="mb-3 flex flex-wrap gap-1.5 px-1">
          {TOPIC_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => onChange({ topic: idea })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-[var(--accent)]/50 hover:text-zinc-100"
            >
              {idea}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block px-2 text-[12px] font-medium text-zinc-400">Channel</label>
        <Segmented
          columns={3}
          value={brief.channelId}
          onChange={(channelId) => onChange({ channelId })}
          options={CHANNELS.map((c) => ({
            value: c.id,
            label: `${c.emoji} ${c.name.split(" ")[0]}`,
            note: c.series,
          }))}
        />

        <label className="mt-3 mb-1.5 block px-2 text-[12px] font-medium text-zinc-400">Pacing</label>
        <Segmented
          columns={2}
          value={brief.pacing}
          onChange={(pacing: Pacing) => onChange({ pacing })}
          options={(Object.keys(PACING) as Pacing[]).map((p) => ({
            value: p,
            label: PACING[p].label,
            note: PACING[p].note,
          }))}
        />

        <label className="mt-3 mb-1.5 block px-2 text-[12px] font-medium text-zinc-400">Aspect</label>
        <Segmented
          columns={3}
          value={brief.aspect}
          onChange={(aspect: Aspect) => onChange({ aspect })}
          options={[
            { value: "16:9" as Aspect, label: "16:9", note: "YouTube" },
            { value: "9:16" as Aspect, label: "9:16", note: "Shorts" },
            { value: "1:1" as Aspect, label: "1:1", note: "Feed" },
          ]}
        />
      </Panel>

      <Panel title="Look &amp; sound">
        <div className="-mx-2">
          <Toggle
            label="Ambience mix"
            hint="Synthesised wind, fire & drone"
            checked={opts.sound}
            onChange={(sound) => onOpts({ sound })}
          />
          <Toggle
            label="Narration captions"
            checked={opts.captions}
            onChange={(captions) => onOpts({ captions })}
          />
          <Toggle
            label="Chapter lower-thirds"
            checked={opts.chapters}
            onChange={(chapters) => onOpts({ chapters })}
          />
          <Toggle label="Channel bug" checked={opts.bug} onChange={(bug) => onOpts({ bug })} />
          <Toggle label="Film grain" checked={opts.grain} onChange={(grain) => onOpts({ grain })} />
          <Toggle label="Vignette" checked={opts.vignette} onChange={(vignette) => onOpts({ vignette })} />
          <Toggle label="Cinematic bars" checked={opts.bars} onChange={(bars) => onOpts({ bars })} />
          <Toggle label="Timecode burn-in" checked={opts.timecode} onChange={(timecode) => onOpts({ timecode })} />
          <Toggle
            label="Voice-over (device TTS)"
            hint="Live preview only — not baked into the export"
            checked={opts.voice}
            onChange={(voice) => onOpts({ voice })}
          />
        </div>
      </Panel>

      <Panel>
        <div className="flex gap-2">
          <Button variant="accent" className="flex-1 py-3 text-[14px]" onClick={() => onGenerate()} disabled={busy}>
            <span className="text-base">{busy ? "⏳" : "🎬"}</span>
            {busy ? "Rendering…" : "Generate"}
          </Button>
          <Button
            className="py-3"
            onClick={() => onReroll()}
            disabled={busy}
            title="Same brief, brand new cut — new plates, camera moves and beat lengths"
          >
            🔄 New cut
          </Button>
        </div>
        {stale && !busy && (
          <p className="mt-2 px-1 text-[11px] leading-snug text-amber-300/90">
            Brief edited — hit generate to re-cut the film with the new topic, channel and pacing.
          </p>
        )}
        {!stale && !busy && (
          <p className="mt-2 px-1 text-[11px] leading-snug text-zinc-500">
            Every run cuts a fresh variation — 🔄 re-rolls the same brief with new plates and camera moves.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "Shots", v: String(script.shots.length) },
            { k: "Runtime", v: fmt(script.duration) },
            { k: "Words", v: String(script.wordCount) },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-white/8 bg-black/30 px-2 py-2">
              <div className="font-mono text-[15px] font-bold text-white">{s.v}</div>
              <div className="text-[10px] tracking-wider text-zinc-500 uppercase">{s.k}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
