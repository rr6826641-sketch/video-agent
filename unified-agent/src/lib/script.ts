import { IMAGES, type ImageKey } from "./media";
import type { Brief, Grade, Motion, Pacing, Shot, Sfx, VideoScript } from "./types";

interface ShotSeed {
  chapter: string;
  caption: string;
  image: ImageKey;
  motion: Motion;
  grade: Grade;
  sfx: Sfx;
  weight: number;
  kind?: "scene" | "cta" | "title";
  /** feature mode: only the first cut of a beat carries the lower-third */
  first?: boolean;
}

export interface ChannelPreset {
  id: string;
  name: string;
  emoji: string;
  accent: string;
  series: string;
  episode: string;
  tagline: string;
  /** big title card words derived from the topic */
  titleFor: (topic: string) => string;
  subtitleFor: (topic: string) => string;
  coldOpen: (topic: string) => ShotSeed[];
  beats: (topic: string) => ShotSeed[];
  outro: (topic: string) => ShotSeed;
}

const T = (topic: string) => topic.toUpperCase();

export const CHANNELS: ChannelPreset[] = [
  {
    id: "bushcraft",
    name: "Bushcraft",
    emoji: "🪓",
    accent: "#e07a3f",
    series: "Wilderness Skills",
    episode: "EP. 12",
    tagline: "Shelter, fire, and the long night.",
    titleFor: T,
    subtitleFor: (topic) => `A field build — ${topic.toLowerCase()}`,
    coldOpen: (topic) => [
      {
        chapter: "Cold Open",
        caption: `Minus twenty-six. Daylight burning down. The first shelter you build decides whether you see morning — so let's talk ${topic.toLowerCase()}.`,
        image: "hero",
        motion: "zoom-out",
        grade: "cold",
        sfx: "wind",
        weight: 6.4,
      },
    ],
    beats: () => [
      {
        chapter: "01 · Pick your ground",
        caption:
          "Skip the valley floor — cold air pools there all night. Take the lee of a ridge, behind spruce, out of the wind.",
        image: "site",
        motion: "pan-right",
        grade: "cold",
        sfx: "wind",
        weight: 6.8,
      },
      {
        chapter: "02 · Pack, don't dig",
        caption:
          "Powder is worthless until it sinters. Stamp it into a mound, give it an hour, and it stops being snow and starts being wall.",
        image: "snowpack",
        motion: "zoom-in",
        grade: "cold",
        sfx: "wind",
        weight: 6.2,
      },
      {
        chapter: "03 · Carve the dome",
        caption:
          "Round sheds wind. Cut the walls thin and even, and push a stick through as a gauge — thirty centimetres is plenty.",
        image: "dome",
        motion: "pan-left",
        grade: "warm",
        sfx: "none",
        weight: 6.6,
      },
      {
        chapter: "04 · Raise the bed",
        caption:
          "Cold sinks. Build the sleeping platform a hand's width above the floor and you rest on insulation instead of ice.",
        image: "platform",
        motion: "zoom-in",
        grade: "warm",
        sfx: "none",
        weight: 6.0,
      },
      {
        chapter: "05 · Breathe",
        caption:
          "Two holes: one high, one low. Your own breath will ice the walls shut and quietly steal your air.",
        image: "dome",
        motion: "zoom-out",
        grade: "warm",
        sfx: "none",
        weight: 5.6,
      },
      {
        chapter: "06 · Fire at the door",
        caption:
          "Keep the flame outside. A reflector wall throws the heat back in, and birch burns wet, frozen, and furious.",
        image: "fire",
        motion: "zoom-in",
        grade: "warm",
        sfx: "fire",
        weight: 6.8,
      },
    ],
    outro: () => ({
      chapter: "Outro",
      caption: "Stay warm out there. Subscribe and I'll see you in the trees.",
      image: "dawn",
      motion: "zoom-out",
      grade: "cold",
      sfx: "wind",
      weight: 6.2,
      kind: "cta",
    }),
  },
  {
    id: "homestead",
    name: "Off-Grid Homestead",
    emoji: "🏚️",
    accent: "#5fa96b",
    series: "Cold Season Build",
    episode: "EP. 04",
    tagline: "Living on what the land gives back.",
    titleFor: T,
    subtitleFor: (topic) => `Building through the freeze — ${topic.toLowerCase()}`,
    coldOpen: (topic) => [
      {
        chapter: "Cold Open",
        caption: `Everything takes twice as long when the water freezes. Here's how we approach ${topic.toLowerCase()} before the snow sets in for good.`,
        image: "hero",
        motion: "zoom-out",
        grade: "cold",
        sfx: "wind",
        weight: 6.4,
      },
    ],
    beats: () => [
      {
        chapter: "01 · Site & drainage",
        caption:
          "Set back from the treeline for wind, and never in the dip where meltwater refills every spring.",
        image: "site",
        motion: "pan-right",
        grade: "cold",
        sfx: "wind",
        weight: 6.6,
      },
      {
        chapter: "02 · Insulate the floor",
        caption:
          "A foot of packed snow under the deck beats a pallet on frozen ground. Free insulation, every winter.",
        image: "snowpack",
        motion: "zoom-in",
        grade: "cold",
        sfx: "wind",
        weight: 6.2,
      },
      {
        chapter: "03 · Keep it small",
        caption:
          "Small volume warms fast. We build for one room and let the stove do the rest.",
        image: "dome",
        motion: "pan-left",
        grade: "warm",
        sfx: "none",
        weight: 6.4,
      },
      {
        chapter: "04 · Sleep warm",
        caption:
          "Raise the bed, layer the bedding, and put the water bottle at your feet. Old rules, still true.",
        image: "platform",
        motion: "zoom-in",
        grade: "warm",
        sfx: "none",
        weight: 6.0,
      },
      {
        chapter: "05 · Ventilation",
        caption:
          "Condensation rots a cabin faster than weather does. One vent up high, one down low, always open.",
        image: "dome",
        motion: "zoom-out",
        grade: "warm",
        sfx: "none",
        weight: 5.8,
      },
      {
        chapter: "06 · The stove",
        caption:
          "Outside stack, stone heat shield, and a full box of split birch before dark. Then the night is easy.",
        image: "fire",
        motion: "zoom-in",
        grade: "warm",
        sfx: "fire",
        weight: 6.6,
      },
    ],
    outro: () => ({
      chapter: "Outro",
      caption: "Full material list is in the description. Thanks for building along with us.",
      image: "dawn",
      motion: "zoom-out",
      grade: "cold",
      sfx: "wind",
      weight: 6.2,
      kind: "cta",
    }),
  },
  {
    id: "overland",
    name: "Winter Overland",
    emoji: "🚙",
    accent: "#4d9de0",
    series: "Cold Route Logs",
    episode: "EP. 21",
    tagline: "Diesel, snow chains, and bad decisions.",
    titleFor: T,
    subtitleFor: (topic) => `Route log — ${topic.toLowerCase()}`,
    coldOpen: (topic) => [
      {
        chapter: "Cold Open",
        caption: `The pass closed behind us at four. So we stopped early, and I want to walk you through ${topic.toLowerCase()} before the temperature really drops.`,
        image: "hero",
        motion: "zoom-out",
        grade: "cold",
        sfx: "wind",
        weight: 6.4,
      },
    ],
    beats: () => [
      {
        chapter: "01 · Park smart",
        caption:
          "Nose out, into the wind, on the packed shoulder. You want to leave without shovelling for an hour.",
        image: "site",
        motion: "pan-right",
        grade: "cold",
        sfx: "wind",
        weight: 6.4,
      },
      {
        chapter: "02 · Stamp a base",
        caption:
          "Pack the snow flat where the tent goes, or you'll roll into the middle of it by two in the morning.",
        image: "snowpack",
        motion: "zoom-in",
        grade: "cold",
        sfx: "wind",
        weight: 6.0,
      },
      {
        chapter: "03 · Cut a doorway",
        caption:
          "Clear the door, pack the skirt, and keep the vestibule small so the heat stays where you sleep.",
        image: "dome",
        motion: "pan-left",
        grade: "warm",
        sfx: "none",
        weight: 6.4,
      },
      {
        chapter: "04 · Kit off the floor",
        caption:
          "Everything damp goes on the platform with you. Frozen boots do not dry in a snow cave at midnight.",
        image: "platform",
        motion: "zoom-in",
        grade: "warm",
        sfx: "none",
        weight: 6.0,
      },
      {
        chapter: "05 · Crack a vent",
        caption:
          "Two centimetres of zip, every night. Otherwise you wake up inside a frost globe.",
        image: "dome",
        motion: "zoom-out",
        grade: "warm",
        sfx: "none",
        weight: 5.6,
      },
      {
        chapter: "06 · Fire by the tailgate",
        caption:
          "Wind screen, dry kindling from under the rig, and a real bed waiting inside. Best hour of the day.",
        image: "fire",
        motion: "zoom-in",
        grade: "warm",
        sfx: "fire",
        weight: 6.6,
      },
    ],
    outro: () => ({
      chapter: "Outro",
      caption: "Route, gear list and coordinates are pinned below. Drive slow out there.",
      image: "dawn",
      motion: "zoom-out",
      grade: "cold",
      sfx: "wind",
      weight: 6.2,
      kind: "cta",
    }),
  },
  {
    id: "dark_history",
    name: "Dark History",
    emoji: "🕯️",
    accent: "#9b6dff",
    series: "The Dark Archive",
    episode: "EP. 07",
    tagline: "The past keeps its secrets close.",
    titleFor: T,
    subtitleFor: (topic) => `From the archive — ${topic.toLowerCase()}`,
    coldOpen: (topic) => [
      {
        chapter: "Cold Open",
        caption: `Some stories were buried on purpose. Tonight we open the file on ${topic.toLowerCase()} — and nothing in it is as clean as the record claims.`,
        image: "hero",
        motion: "zoom-out",
        grade: "neutral",
        sfx: "wind",
        weight: 6.6,
      },
    ],
    beats: () => [
      {
        chapter: "01 · The setting",
        caption:
          "Start with the place, not the crime. A mill town, a border road, a winter that cut the valley off for months — isolation writes half of these stories before anyone acts.",
        image: "site",
        motion: "pan-right",
        grade: "neutral",
        sfx: "wind",
        weight: 6.6,
      },
      {
        chapter: "02 · The record",
        caption:
          "What survives is not what happened — it is what someone chose to write down. Read the ledger against the testimony, and the gaps become the story.",
        image: "snowpack",
        motion: "zoom-in",
        grade: "neutral",
        sfx: "none",
        weight: 6.4,
      },
      {
        chapter: "03 · The silence",
        caption:
          "Every case has a missing hour. Witnesses disagree, a page is torn out, a name is never spoken again. That silence is where the truth usually hides.",
        image: "dome",
        motion: "pan-left",
        grade: "neutral",
        sfx: "wind",
        weight: 6.6,
      },
      {
        chapter: "04 · The turning",
        caption:
          "Then one detail refuses to fit. A light where there should be none, a footprint that leads nowhere, a letter delivered years too late.",
        image: "platform",
        motion: "zoom-in",
        grade: "neutral",
        sfx: "none",
        weight: 6.2,
      },
      {
        chapter: "05 · The fire",
        caption:
          "Records burn conveniently. Barns, courthouses, archives — whenever the file gets close, something catches alight, and the trail goes cold with it.",
        image: "fire",
        motion: "zoom-in",
        grade: "warm",
        sfx: "fire",
        weight: 6.8,
      },
      {
        chapter: "06 · The verdict",
        caption:
          "A verdict is not the truth. It is the version the era could live with. We keep looking, because the dead do not file appeals.",
        image: "dawn",
        motion: "zoom-out",
        grade: "cold",
        sfx: "wind",
        weight: 6.4,
      },
    ],
    outro: () => ({
      chapter: "Outro",
      caption:
        "The next file is already open. Subscribe so the archive reaches you first — and stay curious about the dark.",
      image: "dawn",
      motion: "zoom-out",
      grade: "neutral",
      sfx: "wind",
      weight: 6.2,
      kind: "cta",
    }),
  },
];

export const PACING: Record<Pacing, { label: string; factor: number; note: string }> = {
  quick: { label: "Shorts", factor: 0.72, note: "punchy, vertical-friendly" },
  standard: { label: "Standard", factor: 1, note: "classic 50-second cut" },
  deep: { label: "Deep dive", factor: 1.3, note: "slower, room to breathe" },
  feature: { label: "Feature", factor: 1, note: "~100 rapid cuts, long-form" },
};

const MOTION_CYCLE: Motion[] = ["zoom-in", "pan-right", "zoom-out", "pan-left", "static"];

/* -------------------------------------------------------------- variation */

/** Plates that read as "inside the shelter / at the fire" vs "out in the weather". */
const INDOOR_PLATES: ImageKey[] = ["dome", "platform", "fire"];
const OUTDOOR_PLATES: ImageKey[] = ["site", "snowpack", "hero", "dawn"];

const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/** Deterministic per (seed, topic, channel) — so scrubbing stays frame-accurate. */
const rng = (seed: number) => {
  let s = (seed * 2654435761) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const pick = <T,>(list: T[], roll: number): T => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/**
 * Feature mode chops every beat into a run of short cuts with rotating camera
 * moves — the ~100-scene documentary rhythm.
 */
function splitBeat(seed: ShotSeed, cut = 0): ShotSeed[] {
  const words = seed.caption.split(/\s+/).filter(Boolean);
  const per = Math.max(2, Math.ceil(words.length / 15));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(" "));
  return chunks.map((caption, i) => ({
    ...seed,
    caption,
    first: i === 0,
    motion: MOTION_CYCLE[(i + seed.chapter.length + cut) % MOTION_CYCLE.length],
    weight: (seed.weight * 3) / chunks.length,
  }));
}

export function getChannel(id: string): ChannelPreset {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
}

export function buildScript(brief: Brief): VideoScript {
  const channel = getChannel(brief.channelId);
  const factor = PACING[brief.pacing].factor;

  const seeds: ShotSeed[] = [
    {
      chapter: "Title",
      caption: `${channel.series} — ${channel.episode}`,
      image: "hero",
      motion: "zoom-in",
      grade: "cold",
      sfx: "wind",
      weight: 4.4,
      kind: "title",
    },
    ...channel.coldOpen(brief.topic),
    ...channel.beats(brief.topic),
    channel.outro(brief.topic),
  ];

  const expanded: ShotSeed[] =
    brief.pacing === "feature"
      ? seeds.flatMap((s) => (s.kind === "title" ? [s] : splitBeat(s, brief.seed)))
      : seeds;

  // ── variation pass: every run re-cuts plates, camera moves and beat lengths
  const roll = rng(brief.seed * 7919 + hashString(brief.topic + brief.channelId));
  let prevImage: ImageKey | null = null;
  const varied: ShotSeed[] = expanded.map((seed, i) => {
    if (seed.kind === "title") {
      prevImage = seed.image;
      return seed;
    }
    const group = seed.grade === "warm" ? INDOOR_PLATES : OUTDOOR_PLATES;
    let image = pick(group, roll());
    if (image === prevImage && group.length > 1) {
      image = group[(group.indexOf(image) + 1) % group.length];
    }
    prevImage = image;
    return {
      ...seed,
      image,
      motion: MOTION_CYCLE[(i + brief.seed) % MOTION_CYCLE.length],
      weight: seed.weight * (0.82 + roll() * 0.36),
    };
  });

  let cursor = 0;
  const shots: Shot[] = varied.map((seed, i) => {
    const duration = Math.round(seed.weight * factor * 10) / 10;
    const shot: Shot = {
      id: `${channel.id}-${i}`,
      kind: seed.kind ?? "scene",
      chapter: seed.chapter,
      caption: seed.caption,
      image: IMAGES[seed.image],
      motion: seed.motion,
      grade: seed.grade,
      sfx: seed.sfx,
      weight: seed.weight,
      first: seed.first ?? true,
      duration,
      start: Math.round(cursor * 10) / 10,
    };
    cursor += duration;
    return shot;
  });

  const title = channel.titleFor(brief.topic);

  return {
    topic: brief.topic,
    channelId: channel.id,
    channelName: channel.name,
    channelEmoji: channel.emoji,
    accent: channel.accent,
    title,
    subtitle: channel.subtitleFor(brief.topic),
    episode: `${channel.episode} · ${channel.series}`,
    shots,
    duration: Math.round(cursor * 10) / 10,
    aspect: brief.aspect,
    pacing: brief.pacing,
    seed: brief.seed,
    wordCount: shots.reduce((n, s) => n + s.caption.split(/\s+/).length, 0),
  };
}

export function toSrt(script: VideoScript): string {
  const stamp = (s: number) => {
    const ms = Math.round((s % 1) * 1000);
    const total = Math.floor(s);
    const sec = total % 60;
    const min = Math.floor(total / 60);
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `00:${p(min)}:${p(sec)},${p(ms, 3)}`;
  };
  return script.shots
    .map(
      (s, i) =>
        `${i + 1}\n${stamp(s.start)} --> ${stamp(s.start + s.duration)}\n${s.caption}\n`,
    )
    .join("\n");
}

export function toNarration(script: VideoScript): string {
  const head = [
    `${script.title} — ${script.channelName.toUpperCase()}`,
    `${script.episode} | runtime ${fmt(script.duration)} | ${script.shots.length} shots`,
    "",
  ].join("\n");
  const body = script.shots
    .map((s) => `[${fmt(s.start)}] ${s.chapter}\n${s.caption}`)
    .join("\n\n");
  return `${head}${body}\n`;
}

export function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
