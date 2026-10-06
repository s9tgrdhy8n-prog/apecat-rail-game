const TRACKS = ["/music/pulsing-2.mp3", "/music/pulsing-1.mp3"];
const GALLERY_TRACK = "/music/delusional-to-win-it.mp3";
const MUSIC_VOL = 0.58;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private fx: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private music: HTMLAudioElement | null = null;
  private track = 0;
  private gallery = false;
  private musicHeld = false;
  private gestured = false;

  get musicPaused() {
    return this.musicHeld;
  }

  unlock() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Keeps the track that belongs to the current screen. */
  startMusic() {
    this.spin();
  }

  /** Gallery only. The two run tracks stay off until you leave. */
  playGallery() {
    this.gallery = true;
    this.spin();
  }

  /** Back to the two run tracks. */
  useRunMusic() {
    this.gallery = false;
    this.spin();
  }

  private spin() {
    this.gestured = true;
    const src = this.gallery ? GALLERY_TRACK : TRACKS[this.track] ?? TRACKS[0];
    if (!this.music) {
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.volume = MUSIC_VOL;
      audio.setAttribute("playsinline", "true");
      audio.addEventListener("ended", () => {
        if (this.gallery) return;
        this.track = (this.track + 1) % TRACKS.length;
        audio.loop = false;
        audio.src = TRACKS[this.track] ?? TRACKS[0];
        if (!this.muted && !this.musicHeld) void audio.play().catch(() => {});
      });
      document.body.appendChild(audio);
      this.music = audio;
    }
    const playingThis = this.music.src.endsWith(src) && !this.music.paused && this.music.currentTime > 0;
    this.music.loop = this.gallery;
    if (!this.music.src.endsWith(src)) {
      this.music.pause();
      this.music.src = src;
      this.music.currentTime = 0;
    }
    if (this.muted || this.musicHeld) return;
    if (playingThis) return;
    const pending = this.music.play();
    this.unlock();
    void pending?.catch(() => {});
  }

  toggleMusic() {
    this.musicHeld = !this.musicHeld;
    if (this.musicHeld) this.music?.pause();
    else this.startMusic();
    return this.musicHeld;
  }

  stopMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.remove();
    this.music.src = "";
    this.music = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.fx) this.fx.gain.value = muted ? 0 : 1;
    if (this.rumbleGain) this.rumbleGain.gain.value = muted ? 0 : 0.02;
    if (muted) this.music?.pause();
    else if (this.gestured && !this.musicHeld) this.startMusic();
  }

  startRumble() {
    this.unlock();
    if (!this.ctx || this.rumbleGain) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.02;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this.rumbleGain = gain;
    this.rumbleFilter = filter;
  }

  setSpeed(speed: number) {
    if (!this.rumbleFilter || !this.ctx) return;
    const freq = 90 + Math.min(220, speed * 4);
    this.rumbleFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }

  coin() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    const t = ctx.currentTime;
    const hop = 620 * 2 ** ((Math.floor(t * 10) % 5) / 12);
    this.tone(ctx, fx, t, hop, hop * 1.5, 0.07, "square", 0.14);
    this.tone(ctx, fx, t + 0.05, hop * 1.5, hop * 2, 0.1, "sine", 0.16);
  }

  jump() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    const t = ctx.currentTime;
    this.tone(ctx, fx, t, 260, 780, 0.16, "sine", 0.22);
    this.whoosh(ctx, fx, t, 480, 2200, 0.14, 0.16);
  }

  slide() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    const t = ctx.currentTime;
    this.tone(ctx, fx, t, 340, 90, 0.16, "sine", 0.18);
    this.whoosh(ctx, fx, t, 1600, 220, 0.18, 0.18);
  }

  lane() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    this.tone(ctx, fx, ctx.currentTime, 360, 280, 0.05, "sine", 0.08);
  }

  die() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    const t = ctx.currentTime;
    this.tone(ctx, fx, t, 196, 48, 0.42, "sawtooth", 0.28);
    this.tone(ctx, fx, t, 140, 42, 0.5, "sine", 0.34);
    this.whoosh(ctx, fx, t, 900, 80, 0.28, 0.32);
    if (this.music) {
      const audio = this.music;
      audio.volume = 0.16;
      window.setTimeout(() => {
        if (this.music === audio && !this.muted) audio.volume = MUSIC_VOL;
      }, 460);
    }
  }

  power() {
    const bus = this.bus();
    if (!bus) return;
    const { ctx, fx } = bus;
    const t = ctx.currentTime;
    this.tone(ctx, fx, t, 520, 880, 0.12, "square", 0.12);
    this.tone(ctx, fx, t + 0.08, 880, 1240, 0.14, "sine", 0.1);
  }

  private bus(): { ctx: AudioContext; fx: GainNode } | null {
    if (this.muted) return null;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.fx) {
      const fx = ctx.createGain();
      fx.gain.value = 1;
      fx.connect(ctx.destination);
      this.fx = fx;
    }
    return { ctx, fx: this.fx };
  }

  private tone(
    ctx: AudioContext,
    fx: GainNode,
    t: number,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(fx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private whoosh(
    ctx: AudioContext,
    fx: GainNode,
    t: number,
    from: number,
    to: number,
    dur: number,
    vol: number,
  ) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(Math.max(60, from), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(fx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
