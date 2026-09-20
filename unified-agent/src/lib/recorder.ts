const CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=h264,opus",
  "video/webm",
  "video/mp4",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

export interface RecordedVideo {
  url: string;
  blob: Blob;
  mimeType: string;
  size: number;
  seconds: number;
  extension: string;
}

export function supportsRecording(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/** Records the live canvas + synth ambience into a downloadable file. */
export class VideoRecorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mimeType: string;

  constructor(canvas: HTMLCanvasElement, audioStream: MediaStream | null, bitsPerSecond = 5_000_000) {
    const stream = canvas.captureStream(30);
    audioStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
    this.mimeType = pickMimeType();
    this.rec = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: bitsPerSecond,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  start() {
    this.startedAt = performance.now();
    this.rec.start(150);
  }

  get state() {
    return this.rec.state;
  }

  stop(): Promise<RecordedVideo> {
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        resolve({
          url: URL.createObjectURL(blob),
          blob,
          mimeType: this.mimeType,
          size: blob.size,
          seconds: (performance.now() - this.startedAt) / 1000,
          extension: this.mimeType.includes("mp4") ? "mp4" : "webm",
        });
      };
      if (this.rec.state !== "inactive") this.rec.stop();
    });
  }
}
