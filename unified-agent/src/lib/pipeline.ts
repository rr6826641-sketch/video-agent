import { fmt } from "./script";
import type { VideoScript } from "./types";

export type StageId =
  | "research"
  | "script"
  | "voice"
  | "visuals"
  | "assembly"
  | "thumbnail"
  | "seo"
  | "publish"
  | "analytics"
  | "ideas";

export interface StageDef {
  id: StageId;
  name: string;
  agent: string;
  emoji: string;
  blurb: string;
  /** simulated wall-clock cost of the agent run */
  ms: number;
}

export const STAGES: StageDef[] = [
  {
    id: "research",
    name: "Research",
    agent: "Scout",
    emoji: "🔎",
    blurb: "Pulls the topic apart into beats, search intent and reference keywords.",
    ms: 900,
  },
  {
    id: "script",
    name: "Script",
    agent: "Quill",
    emoji: "📝",
    blurb: "Writes the narration, chapter beats and shot durations.",
    ms: 1100,
  },
  {
    id: "voice",
    name: "Voice",
    agent: "Vox",
    emoji: "🎙️",
    blurb: "Casts a narrator and previews the read on your device.",
    ms: 700,
  },
  {
    id: "visuals",
    name: "Visuals",
    agent: "Lumen",
    emoji: "🎨",
    blurb: "Assigns a plate, camera move and colour grade to every beat.",
    ms: 850,
  },
  {
    id: "assembly",
    name: "Assembly",
    agent: "Cutter",
    emoji: "🎬",
    blurb: "Cuts the film on canvas and encodes the deliverable file.",
    ms: 1300,
  },
  {
    id: "thumbnail",
    name: "Thumbnail",
    agent: "Pixel",
    emoji: "🖼️",
    blurb: "Composes cover art from the hero plate and the title stack.",
    ms: 800,
  },
  {
    id: "seo",
    name: "SEO",
    agent: "Rank",
    emoji: "📌",
    blurb: "Generates title variants, description, chapters and tags.",
    ms: 750,
  },
  {
    id: "publish",
    name: "Publish",
    agent: "Despatch",
    emoji: "📤",
    blurb: "Builds the upload package and queues it for the YouTube workflow.",
    ms: 950,
  },
  {
    id: "analytics",
    name: "Analytics",
    agent: "Pulse",
    emoji: "📊",
    blurb: "Projects the first fortnight of retention, CTR and views.",
    ms: 700,
  },
  {
    id: "ideas",
    name: "Next ideas",
    agent: "Muse",
    emoji: "🧠",
    blurb: "Suggests the follow-up episodes that keep the series moving.",
    ms: 600,
  },
];

export const STAGE_BY_ID: Record<StageId, StageDef> = STAGES.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<StageId, StageDef>,
);

export type StageStatus = "idle" | "running" | "done";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const seeded = (seed: number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/* --------------------------------------------------------------- research */

export interface ResearchNote {
  intent: string;
  audience: string;
  beats: string[];
  keywords: string[];
  references: { label: string; kind: string }[];
  risk: string;
}

export function runResearch(script: VideoScript): ResearchNote {
  const topic = script.topic.toLowerCase();
  const words = topic.split(/\s+/).filter(Boolean);
  const head = words.slice(0, 2).join(" ") || "wilderness skills";
  return {
    intent: `How-to / build-along search intent for "${topic}" — viewers arrive mid-problem and want a working result on screen.`,
    audience: `${script.channelName} core viewers: experienced outdoors people who want technique detail, not gear reviews.`,
    beats: script.shots
      .filter((s) => s.kind === "scene")
      .slice(0, 6)
      .map((s) => s.chapter.replace(/^\d+\s·\s*/, "")),
    keywords: [
      head,
      `${head} build`,
      `${head} step by step`,
      `winter ${head}`,
      `${script.channelName.toLowerCase()} ${head}`,
      `${head} tutorial`,
      `cold weather ${head}`,
    ],
    references: [
      { label: "Cold-injury guidance · wilderness medicine", kind: "field manual" },
      { label: "Snow metamorphism & sintering basics", kind: "science note" },
      { label: "Channel back-catalogue overlap check", kind: "internal" },
      { label: "Top-ranking how-to intros, first 30 s", kind: "competitor scan" },
    ],
    risk: "No live-fire footage indoors — keep the flame at the doorway and flag the ventilation beat clearly.",
  };
}

/* -------------------------------------------------------------------- seo */

export interface SeoPackage {
  titles: string[];
  description: string;
  tags: string[];
  chapters: { t: string; label: string }[];
  hashtags: string[];
}

export function runSeo(script: VideoScript): SeoPackage {
  const t = script.topic;
  const titles = [
    `${t} — the honest version (${script.shots.length} steps, ${fmt(script.duration)})`,
    `I built a ${t.toLowerCase()} before dark`,
    `${t}: what actually keeps you warm`,
    `The ${t.toLowerCase()} mistake everyone makes`,
  ];
  const description = [
    `A full build-along on ${t.toLowerCase()}. Every beat is timed to the shot list, so you can pause and follow along.`,
    "",
    "CHAPTERS",
    ...script.shots
      .filter((s) => s.kind !== "title")
      .map((s) => `${fmt(s.start)} ${s.chapter}`),
    "",
    "GEAR USED",
    "· Folding saw · · Insulated mitts · · Canvas tarp · · Steel canteen ·",
    "",
    `Filmed on ${script.channelName}. Nothing here is staged — conditions were what they were.`,
  ].join("\n");

  const chapters = script.shots
    .filter((s) => s.kind !== "title")
    .map((s) => ({ t: fmt(s.start), label: s.chapter }));

  return {
    titles,
    description,
    tags: [
      ...t.toLowerCase().split(/\s+/),
      "bushcraft",
      "winter camping",
      "survival shelter",
      "snow shelter",
      "how to",
      "build along",
      script.channelName.toLowerCase(),
    ],
    chapters,
    hashtags: ["#bushcraft", "#wintercamping", "#shelterbuild", "#howto"],
  };
}

/* ------------------------------------------------------------- analytics */

export interface Analytics {
  days: { d: string; views: number; watchHours: number }[];
  retention: number[];
  ctr: number;
  avgView: number;
  subs: number;
  projectedViews: number;
  bestMoment: string;
}

export function runAnalytics(script: VideoScript): Analytics {
  const rnd = seeded(hash(script.topic + script.channelId));
  const base = 1800 + Math.floor(rnd() * 4200);
  const days = Array.from({ length: 14 }, (_, i) => {
    const decay = Math.exp(-i / 5.5);
    const spike = i === 3 ? 1.9 : i === 10 ? 1.35 : 1;
    const views = Math.round(base * decay * spike * (0.75 + rnd() * 0.5));
    return {
      d: `D${i + 1}`,
      views,
      watchHours: Math.round((views * (script.duration / 3600) * (0.35 + rnd() * 0.25)) * 10) / 10,
    };
  });
  const retention = Array.from({ length: 12 }, (_, i) => {
    const drop = Math.exp(-i / 7) * 0.35 + 0.42;
    return Math.round(Math.min(98, Math.max(12, drop * 100 + (rnd() - 0.5) * 8)) * 10) / 10;
  });
  const ctr = Math.round((4.2 + rnd() * 6.4) * 10) / 10;
  const projectedViews = days.reduce((n, d) => n + d.views, 0);
  const sceneShots = script.shots.filter((s) => s.kind === "scene");
  const peak = sceneShots[Math.floor(sceneShots.length * 0.45)] ?? sceneShots[0];
  return {
    days,
    retention,
    ctr,
    avgView: Math.round(script.duration * (0.55 + retention[5] / 200)),
    subs: Math.round(projectedViews * (0.004 + rnd() * 0.006)),
    projectedViews,
    bestMoment: peak ? `${fmt(peak.start)} · ${peak.chapter}` : "—",
  };
}

/* ------------------------------------------------------------------ ideas */

export function runIdeas(script: VideoScript): string[] {
  const seed = script.topic;
  const bank: Record<string, string[]> = {
    bushcraft: [
      "Sleeping system: the three-layer cold night",
      "Fire by friction when everything is wet",
      "Seven nights alone at minus thirty",
      "Reading a river under ice",
      "The 400-gram shelter kit",
    ],
    homestead: [
      "Insulating a cabin floor for the freeze",
      "Winter water: hauling, storing, not freezing",
      "One stove, one room, one winter",
      "Snow as free insulation",
    ],
    overland: [
      "Recovering a rig from a snowbank solo",
      "Cold-soak testing cheap sleeping bags",
      "Diesel gelling: prevention at the pass",
      "The 48-hour storm kit that actually fits",
    ],
  };
  const list = bank[script.channelId] ?? bank.bushcraft;
  return [seed, ...list.filter((i) => i.toLowerCase() !== seed.toLowerCase())].slice(0, 5);
}

/* -------------------------------------------------------- upload package */

export interface UploadPackage {
  file: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  visibility: string;
  publishAt: string;
  language: string;
  madeForKids: boolean;
  playlist: string;
}

export function buildUploadPackage(
  script: VideoScript,
  seo: SeoPackage,
  extension: string,
  publishAt: string,
  visibility: string,
): UploadPackage {
  return {
    file: `${script.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${script.channelId}-${script.aspect.replace(":", "x")}.${extension}`,
    title: seo.titles[0],
    description: seo.description,
    tags: seo.tags,
    category: "Education",
    visibility,
    publishAt,
    language: "en",
    madeForKids: false,
    playlist: `${script.channelName} · ${script.episode.split(" · ")[1] ?? "Series"}`,
  };
}
