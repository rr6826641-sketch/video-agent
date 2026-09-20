import { fmt } from "../lib/script";
import type { VideoScript } from "../lib/types";
import { Panel, Tag } from "./ui";
import { cn } from "../utils/cn";

export function Storyboard({
  script,
  thumbs,
  activeIndex,
  onSelect,
}: {
  script: VideoScript;
  thumbs: string[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  const tall = script.aspect === "9:16";

  return (
    <Panel
      title="Storyboard"
      aside={<span className="font-mono text-[11px] text-zinc-500">{script.shots.length} cuts</span>}
      className="max-h-[calc(100vh-9rem)] overflow-hidden lg:sticky lg:top-5"
    >
      <ol className="-mx-1 max-h-[62vh] space-y-1.5 overflow-y-auto px-1 lg:max-h-[calc(100vh-12rem)]">
        {script.shots.map((shot, i) => {
          const active = i === activeIndex;
          const thumb = thumbs[i];
          return (
            <li key={shot.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={cn(
                  "flex w-full items-stretch gap-2.5 rounded-xl border p-1.5 text-left transition",
                  active
                    ? "border-[var(--accent)]/70 bg-[var(--accent)]/12"
                    : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]",
                )}
              >
                <span
                  className={cn(
                    "relative shrink-0 overflow-hidden rounded-lg bg-zinc-900",
                    tall ? "h-16 w-9" : "h-14 w-24",
                  )}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 animate-pulse bg-white/5" />
                  )}
                  <span className="absolute bottom-0 left-0 bg-black/75 px-1 font-mono text-[9px] font-bold text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-[12px] font-semibold",
                        active ? "text-white" : "text-zinc-300",
                      )}
                    >
                      {shot.chapter}
                    </span>
                    {shot.kind !== "scene" && <Tag accent>{shot.kind}</Tag>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-zinc-500">
                    {shot.caption}
                  </span>
                  <span className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                    <span>{fmt(shot.start)}</span>
                    <span>{shot.duration.toFixed(1)}s</span>
                    <span className="uppercase">{shot.motion}</span>
                    <span>{shot.sfx === "none" ? "·" : `· ${shot.sfx}`}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
