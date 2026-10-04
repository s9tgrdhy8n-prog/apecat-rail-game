const TRACKS = ["/music/pulsing-2.mp3", "/music/pulsing-1.mp3"];

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private music: HTMLAudioElement | null = null;
  private track = 0;
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

  startMusic() {
    this.gestured = true;
    if (this.muted || this.musicHeld) return;
    if (!this.music) {
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.volume = 1;
      audio.setAttribute("playsinline", "true");
      audio.src = TRACKS[0];
      audio.addEventListener("ended", () => {
        this.track = (this.track + 1) % TRACKS.length;
        audio.src = TRACKS[this.track];
        void audio.play().catch(() => {});
      });
      document.body.appendChild(audio);
      this.music = audio;
    }
    if (!this.music.paused && this.music.currentTime > 0) return;
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
    this.blip(920, 1320, 0.09, "square", 0.045);
  }

  jump() {
    this.blip(220, 520, 0.12, "sine", 0.05);
  }

  slide() {
    this.blip(180, 70, 0.14, "sawtooth", 0.03);
  }

  lane() {
    this.blip(340, 280, 0.05, "sine", 0.03);
  }

  die() {
    this.blip(160, 40, 0.38, "sawtooth", 0.07);
  }

  power() {
    this.blip(520, 880, 0.16, "square", 0.05);
  }

  private blip(
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ) {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }
}
