import heroRaw from "../../public/images/shelter-hero.jpg?inline";
import siteRaw from "../../public/images/shelter-site.jpg?inline";
import snowpackRaw from "../../public/images/shelter-snowpack.jpg?inline";
import domeRaw from "../../public/images/shelter-dome.jpg?inline";
import platformRaw from "../../public/images/shelter-platform.jpg?inline";
import fireRaw from "../../public/images/shelter-fire.jpg?inline";
import dawnRaw from "../../public/images/shelter-dawn.jpg?inline";

export type ImageKey =
  | "hero"
  | "site"
  | "snowpack"
  | "dome"
  | "platform"
  | "fire"
  | "dawn";

/**
 * `?inline` normally hands back a base64 data URL (survives the single-file
 * build). If Vite ever resolves the public dir to a plain URL instead, we fall
 * back to that same public path — and the renderer paints its own plate if the
 * network fails, so the film always plays.
 */
const pick = (inlined: string | undefined, publicPath: string): string =>
  typeof inlined === "string" && inlined.startsWith("data:") ? inlined : publicPath;

export const IMAGES: Record<ImageKey, string> = {
  hero: pick(heroRaw, "/images/shelter-hero.jpg"),
  site: pick(siteRaw, "/images/shelter-site.jpg"),
  snowpack: pick(snowpackRaw, "/images/shelter-snowpack.jpg"),
  dome: pick(domeRaw, "/images/shelter-dome.jpg"),
  platform: pick(platformRaw, "/images/shelter-platform.jpg"),
  fire: pick(fireRaw, "/images/shelter-fire.jpg"),
  dawn: pick(dawnRaw, "/images/shelter-dawn.jpg"),
};

export const IMAGE_KEYS = Object.keys(IMAGES) as ImageKey[];
