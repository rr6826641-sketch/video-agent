export interface Mix {
  wind: number;
  fire: number;
  drone: number;
}

const MIXES: Record<string, Mix> = {
  wind: { wind: 0.55, fire: 0, drone: 0.5 },
  fire: { wind: 0.2, fire: 0.6, drone: 0.35 },
  none: { wind: 0.12, fire: 0, drone: 0.62 },
};

type Ctor = typeof AudioContext;

/**
 * Fully synthesised ambience — no audio files needed.
 * Wind = filtered noise + slow LFO gusts, fire = low roar + random crackles,
 * drone = detuned low sines for tension.
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private wind: GainNode | null = null;
  private fire: GainNode | null = null;
  private drone: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crackleTimer: number | null = null;
  private firing = false;
  private volume = 0.75;
  private current: Mix = MIXES.wind;
  private starting: Promise<void> | null = null;

  get ready() {
    return !!this.ctx;
  }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.build().catch(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async build() {
    const Ctx: Ctor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    const dest = ctx.createMediaStreamDestination();
    master.connect(dest);

    // brown-ish noise bed, 3 s loop
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.1 + white * 0.22;
    }

    // --- wind
    const wind = ctx.createGain();
    wind.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.Q.value = 0.7;
    const gust = ctx.createGain();
    gust.gain.value = 0.6;
    const gustLfo = ctx.createOscillator();
    gustLfo.frequency.value = 0.07;
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 320;
    gustLfo.connect(gustAmt);
    gustAmt.connect(lp.frequency);
    gustLfo.start();
    const ampLfo = ctx.createOscillator();
    ampLfo.frequency.value = 0.11;
    const ampAmt = ctx.createGain();
    ampAmt.gain.value = 0.4;
    ampLfo.connect(ampAmt);
    ampAmt.connect(gust.gain);
    ampLfo.start();
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windSrc.connect(lp);
    lp.connect(gust);
    gust.connect(wind);
    wind.connect(master);
    windSrc.start();

    // --- fire roar
    const fire = ctx.createGain();
    fire.gain.value = 0;
    const fireSrc = ctx.createBufferSource();
    fireSrc.buffer = buf;
    fireSrc.loop = true;
    fireSrc.playbackRate.value = 0.6;
    const flp = ctx.createBiquadFilter();
    flp.type = "lowpass";
    flp.frequency.value = 240;
    fireSrc.connect(flp);
    flp.connect(fire);
    fire.connect(master);
    fireSrc.start();

    // --- drone
    const drone = ctx.createGain();
    drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 260;
    for (const [freq, type, level] of [
      [55, "sine", 0.6],
      [82.41, "sine", 0.35],
      [110, "triangle", 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(dlp);
      osc.start();
    }
    dlp.connect(drone);
    drone.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.dest = dest;
    this.noise = buf;
    this.wind = wind;
    this.fire = fire;
    this.drone = drone;
    this.applyMix(this.current);
  }

  private ramp(node: GainNode | null, value: number) {
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.45);
  }

  private applyMix(mix: Mix) {
    this.current = mix;
    this.ramp(this.wind, mix.wind);
    this.ramp(this.drone, mix.drone);
    this.ramp(this.fire, mix.fire * 0.9);
    const wantFire = mix.fire > 0.05;
    if (wantFire !== this.firing) {
      this.firing = wantFire;
      if (wantFire) this.tickCrackle();
      else if (this.crackleTimer !== null) {
        window.clearTimeout(this.crackleTimer);
        this.crackleTimer = null;
      }
    }
  }

  private tickCrackle = () => {
    if (!this.firing) return;
    const ctx = this.ctx;
    if (ctx && this.noise && this.master) {
      const t0 = ctx.currentTime + 0.02;
      const dur = 0.03 + Math.random() * 0.09;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.7 + Math.random() * 1.6;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 2400;
      bp.Q.value = 1.3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16 + Math.random() * 0.4, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      src.start(t0, Math.random() * 2, dur + 0.06);
      src.stop(t0 + dur + 0.06);
    }
    this.crackleTimer = window.setTimeout(this.tickCrackle, 45 + Math.random() * 260);
  };

  setSfx(sfx: "wind" | "fire" | "none") {
    this.applyMix(MIXES[sfx] ?? MIXES.wind);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  get stream(): MediaStream | null {
    return this.dest?.stream ?? null;
  }

  async suspend() {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
  }

  async dispose() {
    if (this.crackleTimer !== null) window.clearTimeout(this.crackleTimer);
    this.crackleTimer = null;
    this.firing = false;
    try {
      await this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.starting = null;
  }
}
