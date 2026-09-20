/**
 * publish.ts - REAL YouTube publish bridge.
 *
 * Agent A could only *simulate* the upload (fake video id). The Python
 * `video-agent` already owns a genuine OAuth uploader (`uploader.py`) with
 * per-channel tokens. This module is the missing wire: the Review Desk posts
 * the freshly rendered master + metadata to a tiny local bridge server
 * (`bridge_server.py`), which saves the file and calls the real uploader.
 *
 * If the bridge is not running we DO NOT pretend - we fall back to the old
 * simulated behaviour and clearly label it as "simulated" so the operator is
 * never misled about whether a video actually went live.
 */

export interface PublishInput {
  blob: Blob;
  filename: string;
  title: string;
  description: string;
  tags: string[];
  visibility: string;
  publishAt?: string;
  madeForKids: boolean;
  /** bushcraft | dark_history | ... (must exist in channels.json) */
  channel: string;
  /** canvas data-url thumbnail (image/png|jpeg) */
  thumbnail?: string | null;
}

export interface PublishResult {
  ok: boolean;
  mode: "bridge" | "simulated" | "offline" | "error";
  videoId?: string;
  url?: string;
  message: string;
}

export interface BridgeHealth {
  online: boolean;
  channels: string[];
  version?: string;
}

const DEFAULT_BRIDGE = "http://127.0.0.1:5055";

/** Bridge base URL - overridable at runtime without a rebuild. */
export function bridgeBase(): string {
  try {
    const qs = new URLSearchParams(window.location.search).get("bridge");
    if (qs) return qs.replace(/\/$/, "");
    const ls = window.localStorage.getItem("yt.bridge");
    if (ls) return ls.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return DEFAULT_BRIDGE;
}

export function setBridgeBase(url: string) {
  try {
    window.localStorage.setItem("yt.bridge", url.replace(/\/$/, ""));
  } catch {
    /* ignore */
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || "image/png";
  const isB64 = !!m[2];
  const raw = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
  const len = raw.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number | undefined;
  const timeout = new Promise<T>((_, reject) => {
    t = window.setTimeout(() => reject(new Error("bridge timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) window.clearTimeout(t);
  }
}

/** Ask the bridge which channels are wired up (so the desk can warn early). */
export async function checkBridge(): Promise<BridgeHealth> {
  try {
    const res = await withTimeout(fetch(`${bridgeBase()}/api/health`, { method: "GET" }), 1500);
    if (!res.ok) return { online: false, channels: [] };
    const data = (await res.json()) as { channels?: string[]; version?: string };
    return { online: true, channels: data.channels ?? [], version: data.version };
  } catch {
    return { online: false, channels: [] };
  }
}

/** Send the master + upload card to the local bridge for a REAL upload. */
export async function publishToYouTube(input: PublishInput): Promise<PublishResult> {
  const fd = new FormData();
  const ext = input.filename.split(".").pop() || "webm";
  fd.append("video", input.blob, input.filename);
  fd.append("title", input.title.slice(0, 100));
  fd.append("description", input.description);
  fd.append("tags", JSON.stringify(input.tags));
  fd.append("visibility", input.visibility);
  fd.append("publishAt", input.publishAt || "");
  fd.append("madeForKids", String(input.madeForKids));
  fd.append("channel", input.channel);
  fd.append("extension", ext);

  if (input.thumbnail && input.thumbnail.startsWith("data:")) {
    const tb = dataUrlToBlob(input.thumbnail);
    if (tb) fd.append("thumbnail", tb, "thumbnail.png");
  }

  try {
    const res = await withTimeout(
      fetch(`${bridgeBase()}/api/publish`, { method: "POST", body: fd }),
      10 * 60 * 1000,
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      videoId?: string;
      url?: string;
      error?: string;
      message?: string;
    };
    if (res.ok && data.ok && data.videoId) {
      return {
        ok: true,
        mode: "bridge",
        videoId: data.videoId,
        url: data.url,
        message: data.message || "Uploaded via local bridge (real YouTube upload).",
      };
    }
    return {
      ok: false,
      mode: "error",
      message: data.error || `Bridge refused the upload (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "offline",
      message:
        err instanceof Error && err.message === "bridge timeout"
          ? "Bridge timed out mid-upload."
          : "Bridge offline - start bridge_server.py to publish for real.",
    };
  }
}
