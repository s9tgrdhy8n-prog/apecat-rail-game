import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Sfx } from "@/game/sfx";
import type { Hud, Nudge, Phase, RailApi } from "@/game/types";

const SAVE_KEY = "apecat-rail-v1";
const LANE = 2.2;
const AHEAD = 78;
const SPEED_MIN = 18;
const SPEED_MAX = 40;
const GRAVITY = 30;
const JUMP_V = 9.4;
const MODEL_YAW = 0;
const SLIDE_PITCH = -1.05;

type Kind = "train" | "barrier" | "sign" | "coin" | "power";
type Cell = "empty" | "train" | "barrier" | "sign" | "coins" | "coinsHigh";
type Power = "shield" | "magnet" | "surge";

type Ent = {
  kind: Kind;
  mesh: THREE.Object3D;
  active: boolean;
  lane: number;
  z: number;
  len: number;
  y: number;
  halfW: number;
  drift: number;
  tag: Power | "";
};

type Save = { v: 1; best: number; muted: boolean };

const INTRO: Cell[][] = [
  ["coins", "coins", "coins"],
  ["train", "coins", "empty"],
  ["empty", "coins", "train"],
  ["empty", "barrier", "empty"],
  ["coins", "empty", "coins"],
  ["empty", "sign", "empty"],
  ["train", "empty", "sign"],
  ["barrier", "coins", "train"],
  ["sign", "empty", "barrier"],
  ["empty", "train", "empty"],
];

const LIBRARY: Cell[][] = [
  ["train", "empty", "empty"],
  ["empty", "train", "empty"],
  ["empty", "empty", "train"],
  ["train", "coins", "empty"],
  ["empty", "coins", "train"],
  ["coins", "empty", "train"],
  ["barrier", "empty", "empty"],
  ["empty", "barrier", "empty"],
  ["empty", "empty", "barrier"],
  ["barrier", "coins", "empty"],
  ["empty", "barrier", "coins"],
  ["sign", "empty", "empty"],
  ["empty", "sign", "empty"],
  ["empty", "empty", "sign"],
  ["sign", "coins", "empty"],
  ["empty", "coinsHigh", "empty"],
  ["coinsHigh", "empty", "coins"],
  ["train", "barrier", "empty"],
  ["empty", "barrier", "train"],
  ["barrier", "empty", "train"],
  ["train", "empty", "sign"],
  ["sign", "empty", "train"],
  ["empty", "sign", "train"],
  ["barrier", "barrier", "empty"],
  ["empty", "barrier", "barrier"],
  ["barrier", "empty", "barrier"],
  ["sign", "sign", "empty"],
  ["empty", "sign", "sign"],
  ["sign", "empty", "sign"],
  ["train", "sign", "coins"],
  ["coins", "train", "barrier"],
  ["sign", "barrier", "empty"],
  ["empty", "sign", "barrier"],
  ["barrier", "empty", "sign"],
  ["sign", "train", "empty"],
  ["empty", "train", "sign"],
  ["barrier", "sign", "train"],
];

function laneX(lane: number) {
  return lane * LANE;
}

function canvasTex(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return new THREE.CanvasTexture(c);
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function lockRootXZ(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position")) continue;
    if (!/hips|armature/i.test(track.name)) continue;
    const values = track.values;
    for (let i = 0; i < values.length; i += 3) {
      values[i] = 0;
      values[i + 2] = 0;
    }
  }
}

export function mountRail(canvas: HTMLCanvasElement, onHud: (h: Hud) => void) {
  const game = new RailWorld(canvas, onHud);
  return {
    api: game.api,
    dispose: () => game.dispose(),
  };
}

class RailWorld {
  api: RailApi;
  private canvas: HTMLCanvasElement;
  private onHud: (h: Hud) => void;
  private disposed = false;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clockLast = -1;
  private sfx = new Sfx();
  private keys = new Set<string>();
  private steerOverride = 0;
  private wasLeft = false;
  private wasRight = false;
  private wasJump = false;
  private wasSlide = false;
  private queueJump = false;
  private queueSlide = false;

  private phase: Phase = "loading";
  private coins = 0;
  private meters = 0;
  private score = 0;
  private best = 0;
  private bestAtStart = 0;
  private muted = false;
  private flash = "";
  private flashT = 0;
  private newBest = false;
  private loadError = "";
  private loadsLeft = 6;
  private runnerId: "apecat" | "boggo" | "gimbo" = "apecat";
  private runnerName: "APECAT" | "BOGGO" | "GIMBO" = "APECAT";
  private runSerial = 0;
  private roster = new Map<
    "apecat" | "boggo" | "gimbo",
    {
      id: "apecat" | "boggo" | "gimbo";
      name: "APECAT" | "BOGGO" | "GIMBO";
      model: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      clips: Map<string, THREE.AnimationAction>;
    }
  >();
  private speed = 0;
  private hudAcc = 0;
  private saveDirty = false;
  private saveAcc = 0;
  private nearMissT = 0;
  private aliveFor = 0;
  private runTime = 0;
  private points = 0;
  private combo = 0;
  private comboT = 0;
  private shield = false;
  private magnetT = 0;
  private surgeT = 0;
  private rushNext = false;
  private shieldRing: THREE.Mesh;

  private lane = 0;
  private x = 0;
  private jumpY = 0;
  private vy = 0;
  private grounded = true;
  private sliding = false;
  private slideT = 0;
  private jumpBuf = 0;
  private slideBuf = 0;
  private jumpCut = 0;
  private yaw = 0;
  private pitch = 0;
  private deathT = 0;
  private trauma = 0;
  private camX = 0;
  private scroll = 0;

  private endZ = 12;
  private introI = 0;
  private spawned = 0;
  private safe = 1;

  private ents: Ent[] = [];
  private segments: THREE.Group[] = [];
  private rig = new THREE.Group();
  private yawGroup = new THREE.Group();
  private pitchGroup = new THREE.Group();
  private fitGroup = new THREE.Group();
  private shadow: THREE.Mesh;
  private mixer: THREE.AnimationMixer | null = null;
  private cat: THREE.Object3D | null = null;
  private clips = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private modelReady = false;
  private lightFx: { mat: THREE.MeshBasicMaterial; base: number; phase: number }[] = [];
  private tunnelLamps: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private sconces: THREE.Object3D[] = [];
  private wallMats: THREE.MeshBasicMaterial[] = [];
  private portraits: { group: THREE.Group; pic: THREE.Mesh; z: number; side: number; image: number }[] = [];
  private portraitPicks = 0;
  private bullCursor = 0;

  private hudSnap = "";

  constructor(canvas: HTMLCanvasElement, onHud: (h: Hud) => void) {
    this.canvas = canvas;
    this.onHud = onHud;
    const saved = readSave();
    this.best = saved.best;
    this.bestAtStart = saved.best;
    this.muted = saved.muted;
    this.sfx.setMuted(saved.muted);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color(0x100814);
    this.scene.fog = new THREE.FogExp2(0x140818, 0.0145);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 160);

    this.scene.add(new THREE.HemisphereLight(0xc9b6ff, 0x2a1028, 0.42));
    const sun = new THREE.DirectionalLight(0xffe4ff, 0.85);
    sun.position.set(2.2, 6.5, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3dfff6, 0.55);
    rim.position.set(-3, 2.4, -10);
    this.scene.add(rim);

    this.buildTunnel();
    this.buildPortraits();
    this.buildPools();

    this.rig.add(this.yawGroup);
    this.yawGroup.add(this.pitchGroup);
    this.pitchGroup.add(this.fitGroup);
    this.scene.add(this.rig);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.scene.add(this.shadow);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x3dfff6, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.95;
    ring.visible = false;
    this.shieldRing = ring;
    this.rig.add(ring);

    this.resize();
    this.bind();
    this.attachProbe();
    this.push(true);
    this.renderer.setAnimationLoop((t) => this.frame(t));
    this.loadRunners();

    this.api = {
      start: () => this.start(),
      kickMusic: () => this.sfx.startMusic(),
      toggleMute: () => this.toggleMute(),
      toggleMusic: () => this.toggleMusic(),
      nudge: (dir) => this.nudge(dir),
      swap: () => this.swapRunner(),
      pick: (name) => this.pickRunner(name),
    };
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onGesture);
    window.removeEventListener("resize", this.resize);
    window.visualViewport?.removeEventListener("resize", this.resize);
    this.sfx.stopMusic();
    if (window.__controlsTest) delete window.__controlsTest;
    this.renderer.dispose();
  }

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onGesture);
    window.addEventListener("resize", this.resize);
    window.visualViewport?.addEventListener("resize", this.resize);
  }

  private onGesture = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".rail-pause")) return;
    this.sfx.startMusic();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return;
    if (e.code === "Tab") {
      e.preventDefault();
      this.swapRunner();
      return;
    }
    if (
      e.code === "Space" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight"
    ) {
      e.preventDefault();
    }
    if ((e.code === "Enter" || e.code === "Space") && (this.phase === "menu" || this.phase === "dead")) {
      this.start();
      return;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 800 ? 1.5 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = w / Math.max(1, h) < 0.9 ? 76 : 58;
    this.camera.updateProjectionMatrix();
  };

  private attachProbe() {
    const qa =
      import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
    if (!qa) return;
    window.__controlsTest = {
      getYaw: () => this.yawGroup.rotation.y,
      getSpeed: () => this.speed,
      setKeys: (codes) => {
        this.keys.clear();
        for (const code of codes) this.keys.add(code);
      },
      setSteer: (v) => {
        this.steerOverride = v;
      },
    };
  }

  private loadRunners() {
    const specs = [
      { id: "apecat" as const, name: "APECAT" as const, url: "/models/apecat_rail.glb" },
      { id: "boggo" as const, name: "BOGGO" as const, url: "/models/boggo.glb" },
      { id: "gimbo" as const, name: "GIMBO" as const, url: "/models/gimbo.glb" },
    ];
    const loader = new GLTFLoader();
    for (const spec of specs) {
      loader.load(
        spec.url,
        (gltf) => {
          if (this.disposed) return;
          for (const clip of gltf.animations) lockRootXZ(clip);
          const model = gltf.scene;
          model.visible = false;
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.frustumCulled = false;
            mesh.castShadow = false;
          });
          this.fitGroup.add(model);
          const mixer = new THREE.AnimationMixer(model);
          const clips = new Map<string, THREE.AnimationAction>();
          for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip);
            action.loop = THREE.LoopRepeat;
            action.clampWhenFinished = false;
            clips.set(clip.name, action);
          }
          this.fitModel(model, spec.id === "boggo" ? 1.2 : 1);
          this.roster.set(spec.id, { id: spec.id, name: spec.name, model, mixer, clips });
          this.settleLoad();
        },
        undefined,
        () => {
          if (this.disposed) return;
          this.settleLoad();
        },
      );
    }
  }

  private settleLoad() {
    this.loadsLeft -= 1;
    if (this.loadsLeft > 0) return;
    const first = this.roster.get("apecat") ?? this.roster.get("boggo") ?? this.roster.get("gimbo");
    if (!first) {
      this.loadError = "Couldn’t load a runner. Refresh and try again.";
      this.push(true);
      return;
    }
    this.activate(first.id, false);
    this.modelReady = true;
    this.phase = "menu";
    this.push(true);
  }

  private activate(id: "apecat" | "boggo" | "gimbo", announce: boolean) {
    const next = this.roster.get(id);
    if (!next) return;
    if (this.current) this.current.stop();
    for (const runner of this.roster.values()) runner.model.visible = false;
    next.model.visible = true;
    this.runnerId = id;
    this.runnerName = next.name;
    this.cat = next.model;
    this.mixer = next.mixer;
    this.clips = next.clips;
    this.current = null;
    this.play(this.phase === "run" ? "Run" : "Idle", 0);
    if (announce) {
      this.flash = next.name;
      this.flashT = 0.8;
    }
    this.push(true);
  }

  private pickRunner(name: "APECAT" | "BOGGO" | "GIMBO") {
    if (!this.modelReady) return;
    const id = name === "APECAT" ? "apecat" : name === "BOGGO" ? "boggo" : "gimbo";
    if (!this.roster.has(id) || id === this.runnerId) return;
    this.activate(id, true);
  }

  private swapRunner() {
    if (!this.modelReady) return;
    const order = ["apecat", "boggo", "gimbo"] as const;
    const available = order.filter((id) => this.roster.has(id));
    const i = Math.max(0, available.indexOf(this.runnerId));
    const next = available[(i + 1) % available.length];
    if (next) this.activate(next, true);
  }

  private fitModel(model: THREE.Object3D, extra = 1) {
    model.rotation.y = MODEL_YAW;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const scale = height > 0.05 && height < 80 ? (1.72 * extra) / height : extra;
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
  }

  private play(name: string, fade = 0.18) {
    const next = this.clips.get(name) ?? this.clips.values().next().value ?? null;
    if (!next || next === this.current) return;
    if (this.current) this.current.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this.current = next;
  }

  private buildTunnel() {
    const floorMap = canvasTex((g, w, h) => {
      g.fillStyle = "#14121a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1c1924";
      g.fillRect(w * 0.18, 0, w * 0.64, h);
      g.strokeStyle = "#ff2bd6";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(w * 0.2, 0);
      g.lineTo(w * 0.2, h);
      g.stroke();
      g.strokeStyle = "#3dfff6";
      g.beginPath();
      g.moveTo(w * 0.8, 0);
      g.lineTo(w * 0.8, h);
      g.stroke();
      g.strokeStyle = "#5a3d78";
      g.lineWidth = 3;
      for (const p of [0.36, 0.5, 0.64]) {
        g.beginPath();
        g.moveTo(w * p, 0);
        g.lineTo(w * p, h);
        g.stroke();
      }
    }, 256, 256);
    floorMap.wrapS = THREE.RepeatWrapping;
    floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.repeat.set(1, 4);

    const wallL = new THREE.MeshStandardMaterial({ color: 0x140818, roughness: 0.72, metalness: 0.18 });
    const wallR = new THREE.MeshStandardMaterial({ color: 0x100816, roughness: 0.72, metalness: 0.18 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.55, metalness: 0.35 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0612, roughness: 0.8, metalness: 0.08 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.9, roughness: 0.22 });
    const neon = [0xff2bd6, 0x3dfff6, 0x7c4dff, 0xffe14a];

    const SEG = 18;
    for (let i = 0; i < 8; i++) {
      const cA = neon[i % neon.length]!;
      const cB = neon[(i + 1) % neon.length]!;
      const seg = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.28, SEG), floorMat);
      floor.position.y = -0.14;
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, SEG), wallL);
      left.position.set(-4.2, 2.2, 0);
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, SEG), wallR);
      right.position.set(4.2, 2.2, 0);
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.28, SEG), ceilMat);
      ceil.position.y = 4.5;

      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, SEG), this.glowMat(cB, 0.9));
      tube.position.y = 4.32;
      const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, SEG), this.glowMat(cA, 0.95));
      edgeL.position.set(-3.28, 0.05, 0);
      const edgeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, SEG), this.glowMat(cB, 0.95));
      edgeR.position.set(3.28, 0.05, 0);
      const laneL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, SEG), this.glowMat(cA, 0.45));
      laneL.position.set(-LANE, 0.045, 0);
      const laneR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, SEG), this.glowMat(cB, 0.45));
      laneR.position.set(LANE, 0.045, 0);
      const kickL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, SEG), this.glowMat(cA, 0.62));
      kickL.position.set(-3.98, 0.28, 0);
      const kickR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, SEG), this.glowMat(cB, 0.62));
      kickR.position.set(3.98, 0.28, 0);

      const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, SEG), railMat);
      railL.position.set(-0.55, 0.02, 0);
      const railR = railL.clone();
      railR.position.x = 0.55;

      const sconceMat = new THREE.MeshStandardMaterial({
        color: 0x120810,
        emissive: cA,
        emissiveIntensity: 2.4,
        roughness: 0.35,
      });
      const sconceMatB = sconceMat.clone();
      sconceMatB.emissive = new THREE.Color(cB);
      const lampL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.7), sconceMat);
      lampL.position.set(-3.96, 2.55, -5.5);
      const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.7), sconceMatB);
      lampR.position.set(3.96, 2.55, 5.5);
      this.sconces.push(lampL, lampR);

      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.35, 18), this.glowMat(cA, 0.2));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.045, 0);

      const lamp = new THREE.PointLight(cB, 36, 16, 2);
      lamp.position.set(0, 3.85, 0);
      this.tunnelLamps.push({ light: lamp, base: lamp.intensity, phase: i * 0.7 });

      const sideL = new THREE.PointLight(cA, 18, 10, 2);
      sideL.position.set(-3.15, 1.55, -4.2);
      this.tunnelLamps.push({ light: sideL, base: sideL.intensity, phase: i * 0.7 + 1.1 });
      const sideR = new THREE.PointLight(cB, 18, 10, 2);
      sideR.position.set(3.15, 1.55, 4.2);
      this.tunnelLamps.push({ light: sideR, base: sideR.intensity, phase: i * 0.7 + 2.2 });

      seg.add(
        floor,
        left,
        right,
        ceil,
        tube,
        edgeL,
        edgeR,
        laneL,
        laneR,
        kickL,
        kickR,
        railL,
        railR,
        lampL,
        lampR,
        pool,
        lamp,
        sideL,
        sideR,
      );
      seg.position.z = 16 - i * SEG;
      this.scene.add(seg);
      this.segments.push(seg);
    }

    const runnerLight = new THREE.PointLight(0xff2bd6, 7, 6.5, 2);
    runnerLight.position.set(0, 1.7, 0.8);
    this.rig.add(runnerLight);
    this.tunnelLamps.push({ light: runnerLight, base: 7, phase: 0 });
  }

  private glowMat(color: number, opacity: number) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.lightFx.push({ mat, base: opacity, phase: this.lightFx.length * 0.65 });
    return mat;
  }

  private buildPortraits() {
    const files = [
      "/textures/walls/koko-cowboy.png",
      "/textures/walls/koko-frog.png",
      "/textures/walls/bbx.jpg",
      ...Array.from({ length: 28 }, (_, i) =>
        `/textures/walls/Bulltoshi_Wall_${String(i + 1).padStart(2, "0")}.png`,
      ),
    ];
    const loader = new THREE.TextureLoader();
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.wallMats = files.map((url) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x241c16 });
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropy;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      });
      return mat;
    });

    const gold = new THREE.MeshBasicMaterial({ color: 0xe6b34d });
    const liner = new THREE.MeshBasicMaterial({ color: 0x140f0c });
    const frameGeo = new THREE.PlaneGeometry(1.48, 1.48);
    const linerGeo = new THREE.PlaneGeometry(1.34, 1.34);
    const picGeo = new THREE.PlaneGeometry(1.26, 1.26);
    const gap = 10;

    for (let z = -8; z > -AHEAD - 4; z -= gap) {
      for (const side of [-1, 1]) {
        const image = this.pickPortrait(z);
        const group = new THREE.Group();
        const frame = new THREE.Mesh(frameGeo, gold);
        const back = new THREE.Mesh(linerGeo, liner);
        back.position.z = 0.012;
        const pic = new THREE.Mesh(picGeo, this.wallMats[image]!);
        pic.position.z = 0.024;
        group.add(frame, back, pic);
        group.position.set(side * 3.86, 2.02, z);
        group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(group);
        this.portraits.push({ group, pic, z, side, image });
      }
    }
  }

  private pickPortrait(z: number) {
    const banned = new Set<number>();
    for (const p of this.portraits) {
      if (Math.abs(p.z - z) < 30) banned.add(p.image);
    }
    const n = this.wallMats.length;
    this.portraitPicks += 1;
    const step = this.portraitPicks % 18;
    const featured = step === 1 ? 0 : step === 10 ? 2 : step === 4 || step === 13 ? 1 : -1;
    if (featured >= 0 && !banned.has(featured)) return featured;
    const bullCount = Math.max(1, n - 3);
    for (let k = 0; k < bullCount; k++) {
      const image = 3 + ((this.bullCursor + k) % bullCount);
      if (!banned.has(image)) {
        this.bullCursor = (this.bullCursor + k + 1) % bullCount;
        return image;
      }
    }
    return 3;
  }

  private scrollPortraits() {
    const n = this.wallMats.length;
    if (!n || this.portraits.length === 0) return;
    const gap = 10;
    const dz = this.scroll;
    for (const p of this.portraits) {
      p.z += dz;
      p.group.position.z = p.z;
    }
    for (const side of [-1, 1]) {
      const row = this.portraits.filter((p) => p.side === side);
      for (let guard = 0; guard < 4; guard++) {
        let front = row[0];
        let back = row[0];
        if (!front || !back) break;
        for (const p of row) {
          if (p.z > front.z) front = p;
          if (p.z < back.z) back = p;
        }
        if (front.z < 14) break;
        front.z = back.z - gap;
        front.image = this.pickPortrait(front.z);
        front.pic.material = this.wallMats[front.image]!;
        front.group.position.z = front.z;
      }
    }
  }

  private buildPools() {
    this.loadBearWalls();
    this.loadShortBears();
    this.loadBananas();
    this.loadPowers();
  }

  private loadPowers() {
    const specs: { tag: Power; color: number; geo: THREE.BufferGeometry }[] = [
      { tag: "shield", color: 0x3dfff6, geo: new THREE.TorusGeometry(0.42, 0.07, 8, 22) },
      { tag: "magnet", color: 0xff2bd6, geo: new THREE.OctahedronGeometry(0.4, 0) },
      { tag: "surge", color: 0xffe14a, geo: new THREE.IcosahedronGeometry(0.36, 0) },
    ];
    for (const spec of specs) {
      for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(
          spec.geo,
          new THREE.MeshBasicMaterial({ color: spec.color }),
        );
        mesh.position.y = 1.15;
        group.add(mesh);
        const ent = this.makeEnt("power", group, 0.6, 0.46);
        ent.tag = spec.tag;
        ent.y = 1.15;
      }
    }
  }

  private loadBearWalls() {
    const loader = new GLTFLoader();
    loader.load("/models/bear_wall_slider.glb", (gltf) => {
      if (this.disposed) return;
      const src = gltf.scene;
      src.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(src);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = 1.9 / Math.max(0.01, size.x);
      const depth = size.z * s;
      src.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial || !std.map) continue;
          std.emissiveMap = std.map;
          std.emissive = new THREE.Color(0xffffff);
          std.emissiveIntensity = 0.65;
          std.roughness = 0.62;
          std.metalness = 0.04;
          std.needsUpdate = true;
        }
      });
      for (let i = 0; i < 8; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Group();
        spin.rotation.y = Math.PI;
        const wall = src.clone(true);
        wall.scale.setScalar(s);
        wall.position.set(-center.x * s, -box.min.y * s, -center.z * s);
        wall.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        spin.add(wall);
        group.add(spin);
        this.ents.push(this.makeEnt("train", group, Math.max(0.85, depth), 0.86));
      }
      this.settleLoad();
    }, undefined, () => this.settleLoad());
  }

  private loadShortBears() {
    const loader = new GLTFLoader();
    loader.load("/models/short_bear_wall.glb", (gltf) => {
      if (this.disposed) return;
      const src = gltf.scene;
      src.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(src);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = 0.82 / Math.max(0.01, size.y);
      const depth = size.z * s;
      const halfW = (size.x * s) / 2;
      src.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial || !std.map) continue;
          std.emissiveMap = std.map;
          std.emissive = new THREE.Color(0xffffff);
          std.emissiveIntensity = 0.65;
          std.roughness = 0.62;
          std.metalness = 0.04;
          std.needsUpdate = true;
        }
      });
      for (let i = 0; i < 10; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Group();
        spin.rotation.y = Math.PI;
        const wall = src.clone(true);
        wall.scale.setScalar(s);
        wall.position.set(-center.x * s, -box.min.y * s, -center.z * s);
        wall.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        spin.add(wall);
        group.add(spin);
        this.ents.push(this.makeEnt("barrier", group, Math.max(0.7, depth), Math.min(0.78, halfW)));
      }
      for (let i = 0; i < 8; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Group();
        spin.rotation.y = Math.PI;
        const wall = src.clone(true);
        wall.scale.setScalar(s);
        wall.position.set(-center.x * s, -box.min.y * s + 1.28, -center.z * s);
        wall.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        spin.add(wall);
        group.add(spin);
        this.ents.push(this.makeEnt("sign", group, Math.max(0.55, depth), Math.min(0.78, halfW)));
      }
      this.settleLoad();
    }, undefined, () => this.settleLoad());
  }

  private loadBananas() {
    const loader = new GLTFLoader();
    loader.load("/models/banana_buddy.glb", (gltf) => {
      if (this.disposed) return;
      const src = gltf.scene;
      src.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
      });
      const height = 1.9;
      const target = 1.08;
      const s = target / height;
      for (let i = 0; i < 70; i++) {
        const group = new THREE.Group();
        const buddy = src.clone(true);
        buddy.scale.setScalar(s);
        buddy.position.y = -(height * s) / 2;
        buddy.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        group.add(buddy);
        this.ents.push(this.makeEnt("coin", group, 0.55, 0.42));
      }
      this.settleLoad();
    }, undefined, () => this.settleLoad());
  }

  private makeEnt(kind: Kind, mesh: THREE.Object3D, len: number, halfW: number): Ent {
    mesh.visible = false;
    this.scene.add(mesh);
    return { kind, mesh, active: false, lane: 0, z: 0, len, y: 0, halfW, drift: 0, tag: "" };
  }

  private take(kind: Kind) {
    for (const ent of this.ents) {
      if (ent.kind === kind && !ent.active) return ent;
    }
    return null;
  }

  private place(kind: Kind, lane: number, z: number, y = 0) {
    const ent = this.take(kind);
    if (!ent) return;
    ent.active = true;
    ent.lane = lane;
    ent.z = z;
    ent.y = y;
    ent.drift = 0;
    ent.mesh.visible = true;
    ent.mesh.position.set(laneX(lane), y, z);
  }

  private placePattern(cells: Cell[], z: number) {
    cells.forEach((cell, index) => {
      const lane = index - 1;
      if (cell === "train") this.place("train", lane, z);
      else if (cell === "barrier") this.place("barrier", lane, z);
      else if (cell === "sign") this.place("sign", lane, z);
      else if (cell === "coins" || cell === "coinsHigh") {
        const high = cell === "coinsHigh";
        for (let k = -2; k <= 2; k++) this.place("coin", lane, z + k * 1.5, high ? 1.7 : 0.98);
      }
    });
    this.dropPower(cells, z);
    this.armSlider(cells, z);
  }

  private dropPower(cells: Cell[], z: number) {
    if (this.heat() < 0.12 || Math.random() > 0.22) return;
    const open = cells
      .map((cell, index) => (cell === "empty" ? index : -1))
      .filter((index) => index >= 0);
    if (!open.length) return;
    const index = open[Math.floor(Math.random() * open.length)]!;
    this.place("power", index - 1, z, 1.15);
  }

  private armSlider(cells: Cell[], z: number) {
    if (this.heat() < 0.2) return;
    const opts: { index: number; dir: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const cell = cells[i];
      if (cell !== "train" && cell !== "barrier" && cell !== "sign") continue;
      for (const dir of [-1, 1]) {
        const j = i + dir;
        if (j < 0 || j > 2) continue;
        const next = cells[j];
        if (next === "empty" || next === "coins" || next === "coinsHigh") opts.push({ index: i, dir });
      }
    }
    if (!opts.length || Math.random() > 0.25 + this.heat() * 0.5) return;
    const pick = opts[Math.floor(Math.random() * opts.length)]!;
    const lane = pick.index - 1;
    const ent = this.ents.find(
      (item) => item.active && item.z === z && item.lane === lane && item.kind !== "coin" && item.kind !== "power",
    );
    if (ent) ent.drift = pick.dir;
  }

  private heat() {
    const n = Math.max(0, this.spawned - INTRO.length);
    return Math.min(1, n / 34);
  }

  private gap() {
    return 34 - this.heat() * 16;
  }

  private takePattern(): Cell[] {
    if (this.introI < INTRO.length) {
      const row = INTRO[this.introI]!;
      this.introI += 1;
      return row;
    }
    const h = this.heat();
    let pool = LIBRARY.filter((row) => {
      if (row[this.safe] === "train") return false;
      const trains = row.filter((c) => c === "train").length;
      const signs = row.some((c) => c === "sign");
      const doubles = trains > 1 || row.filter((c) => c === "barrier" || c === "sign").length > 1;
      const mixed = trains > 0 && row.some((c) => c === "barrier" || c === "sign");
      if (h < 0.2 && (signs || doubles || mixed)) return false;
      if (h < 0.45 && (doubles || trains > 1)) return false;
      if (h < 0.7 && trains > 1) return false;
      return true;
    });
    if (!pool.length) pool = LIBRARY.filter((row) => row[this.safe] !== "train");
    const row = pool[Math.floor(Math.random() * pool.length)] ?? ["empty", "coins", "empty"];
    const shift = 0.28 + h * 0.45;
    if (Math.random() < shift) {
      const neigh = [this.safe - 1, this.safe + 1].filter(
        (j) => j >= 0 && j < 3 && row[j] !== "train",
      );
      if (neigh.length) this.safe = neigh[Math.floor(Math.random() * neigh.length)]!;
    }
    return row;
  }

  private ensureTrack() {
    let guard = 0;
    while (this.endZ > -AHEAD && guard++ < 20) {
      let gap = this.gap();
      if (this.rushNext) gap = Math.max(15, gap * 0.58);
      this.rushNext = this.heat() > 0.38 && Math.random() < 0.36;
      this.endZ -= gap;
      this.placePattern(this.takePattern(), this.endZ);
      this.spawned += 1;
    }
  }

  private clearEnts() {
    for (const ent of this.ents) {
      ent.active = false;
      ent.mesh.visible = false;
    }
  }

  private start() {
    if (!this.modelReady || this.phase === "run" || this.phase === "loading") return;
    this.sfx.unlock();
    this.sfx.startMusic();
    this.sfx.startRumble();
    this.coins = 0;
    this.meters = 0;
    this.score = 0;
    this.points = 0;
    this.combo = 0;
    this.comboT = 0;
    this.shield = false;
    this.magnetT = 0;
    this.surgeT = 0;
    this.rushNext = false;
    this.speed = SPEED_MIN;
    this.lane = 0;
    this.x = 0;
    this.jumpY = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideT = 0;
    this.jumpBuf = 0;
    this.slideBuf = 0;
    this.jumpCut = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.deathT = 0;
    this.trauma = 0;
    this.flash = "";
    this.flashT = 0;
    this.newBest = false;
    this.nearMissT = 0;
    this.aliveFor = 0;
    this.introI = 0;
    this.spawned = 0;
    this.safe = 1;
    this.endZ = 12;
    this.bestAtStart = this.best;
    this.keys.delete("Space");
    this.keys.delete("KeyW");
    this.keys.delete("ArrowUp");
    this.clearEnts();
    this.ensureTrack();
    this.phase = "run";
    this.play("Run");
    this.push(true);
  }

  private toggleMute() {
    this.muted = !this.muted;
    this.sfx.setMuted(this.muted);
    this.saveDirty = true;
    this.persist();
    this.push(true);
  }

  private toggleMusic() {
    this.sfx.toggleMusic();
    this.push(true);
  }

  private nudge(dir: Nudge) {
    if (this.phase !== "run") return;
    if (dir === -1) this.requestLane(-1);
    else if (dir === 1) this.requestLane(1);
    else if (dir === "jump") this.queueJump = true;
    else this.queueSlide = true;
  }

  private requestLane(dir: -1 | 1) {
    const next = Math.max(-1, Math.min(1, this.lane + dir));
    if (next === this.lane) return;
    this.lane = next;
    this.sfx.lane();
    this.trauma = Math.max(this.trauma, 0.12);
  }

  private tryJump() {
    this.jumpBuf = 0.14;
  }

  private trySlide() {
    if (this.sliding) return;
    if (!this.grounded) {
      this.slideBuf = 0.28;
      return;
    }
    this.sliding = true;
    this.slideT = 0.66;
    this.sfx.slide();
  }

  private body(): { bot: number; top: number } {
    if (this.sliding) return { bot: 0.02, top: 0.58 };
    return { bot: this.jumpY + 0.04, top: this.jumpY + 1.62 };
  }

  private die() {
    if (this.phase !== "run") return;
    this.phase = "dead";
    this.speed = 0;
    this.shield = false;
    this.shieldRing.visible = false;
    this.trauma = 1;
    this.newBest = this.score > this.bestAtStart && this.score > 0;
    if (this.score > this.best) this.best = this.score;
    this.runSerial += 1;
    this.sfx.die();
    this.persist();
    this.push(true);
  }

  private frame(t: number) {
    if (this.disposed) return;
    if (this.clockLast < 0) this.clockLast = t;
    if (document.hidden) {
      this.clockLast = t;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (t - this.clockLast) / 1000));
    this.clockLast = t;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number) {
    this.runTime += dt;
    const pulse = this.runTime;
    for (const fx of this.lightFx) {
      fx.mat.opacity = fx.base * (0.72 + 0.28 * Math.sin(pulse * 2.4 + fx.phase));
    }
    for (const lamp of this.tunnelLamps) {
      lamp.light.intensity = lamp.base * (0.62 + 0.38 * Math.sin(pulse * 2.1 + lamp.phase));
    }
    for (const sconce of this.sconces) {
      const z = (sconce.parent?.position.z ?? 0) + sconce.position.z;
      sconce.visible = z < -4;
    }
    if (this.mixer && this.phase !== "dead") {
      const scale = this.phase === "run" ? 0.9 + (this.speed / SPEED_MAX) * 0.65 : 0.75;
      this.mixer.timeScale = scale;
      this.mixer.update(dt);
      if (this.cat) this.cat.rotation.y = MODEL_YAW;
    }

    this.scroll = 0;
    if (this.phase === "run") this.simRun(dt);
    else if (this.phase === "dead") this.simDead(dt);
    else {
      this.scroll = this.phase === "menu" ? 2.4 * dt : 0;
      this.poseCharacter(dt);
    }

    this.layoutEnts();
    this.recycleTunnel();
    this.scrollPortraits();
    this.updateCamera(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash = "";
    }
    this.hudAcc += dt;
    if (this.hudAcc > 0.12) {
      this.hudAcc = 0;
      this.push(false);
    }
    if (this.saveDirty) {
      this.saveAcc += dt;
      if (this.saveAcc > 0.6) this.persist();
    }
  }

  private simRun(dt: number) {
    const ramp = 1 - Math.exp(-this.meters / 340);
    this.speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * ramp;
    this.sfx.setSpeed(this.speed);
    const dz = this.speed * dt;
    this.scroll = dz;
    this.meters += dz;
    this.aliveFor += dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.surgeT > 0) this.surgeT -= dt;

    this.readInput();
    this.endZ += dz;
    this.ensureTrack();

    const target = laneX(this.lane);
    const maxStep = (LANE / 0.13) * dt;
    this.x += Math.max(-maxStep, Math.min(maxStep, target - this.x));

    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.sliding = false;
    }
    if (this.grounded && this.slideBuf > 0 && !this.sliding) this.trySlide();
    if (this.grounded) this.slideBuf = 0;

    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if ((this.grounded || this.jumpY < 0.02) && !this.sliding) {
        this.vy = JUMP_V;
        this.grounded = false;
        this.sliding = false;
        this.jumpBuf = 0;
        this.jumpCut = 0.2;
        this.jumpY = 0.01;
        this.sfx.jump();
      }
    }
    if (!this.grounded) {
      const held = this.keys.has("Space") || this.keys.has("ArrowUp") || this.keys.has("KeyW");
      if (this.jumpCut > 0) this.jumpCut -= dt;
      else if (!held && this.vy > 8) this.vy = 8;
      this.vy -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    this.poseCharacter(dt);
    this.moveAndCollide(dz);
    this.tally();
  }

  private tally() {
    this.score = Math.floor(this.meters) + this.points;
    if (this.score > this.best) {
      this.best = this.score;
      this.saveDirty = true;
    }
  }

  private entX(ent: Ent) {
    if (!ent.drift) return laneX(ent.lane);
    const t = THREE.MathUtils.smoothstep(ent.z, -48, -10);
    return (ent.lane + ent.drift * t) * LANE;
  }

  private grantPower(tag: Power | "") {
    if (tag === "shield") {
      this.shield = true;
      this.flash = "SHIELD";
    } else if (tag === "magnet") {
      this.magnetT = 8;
      this.flash = "MAGNET";
    } else {
      this.surgeT = 8;
      this.flash = "x2";
    }
    this.flashT = 0.7;
    this.sfx.power();
  }

  private readInput() {
    const leftNow =
      this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.steerOverride > 0.35;
    const rightNow =
      this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.steerOverride < -0.35;
    if (leftNow && !this.wasLeft && !(rightNow && !this.wasRight)) this.requestLane(-1);
    if (rightNow && !this.wasRight && !(leftNow && !this.wasLeft)) this.requestLane(1);
    this.wasLeft = leftNow;
    this.wasRight = rightNow;

    const jumpNow = this.keys.has("Space") || this.keys.has("ArrowUp") || this.keys.has("KeyW");
    if ((jumpNow && !this.wasJump) || this.queueJump) this.tryJump();
    this.wasJump = jumpNow;
    this.queueJump = false;

    const slideNow =
      this.keys.has("KeyS") || this.keys.has("ArrowDown") || this.keys.has("ControlLeft");
    if ((slideNow && !this.wasSlide) || this.queueSlide) this.trySlide();
    this.wasSlide = slideNow;
    this.queueSlide = false;
  }

  private moveAndCollide(dz: number) {
    const body = this.body();
    for (const ent of this.ents) {
      if (!ent.active) continue;
      ent.z += dz;
      const reach = ent.halfW + 0.34;
      const dx = Math.abs(this.x - this.entX(ent));
      const zHit = overlapZ(ent.z, ent.len, dz);
      if (ent.kind === "coin" || ent.kind === "power") {
        const magnet = this.magnetT > 0;
        const high = ent.y > 1.4;
        const yOk = ent.kind === "power" || magnet || !high || this.jumpY > 0.75;
        const reachX = ent.kind === "power" ? 1.15 : magnet ? LANE * 1.7 : 1.05;
        const reachZ = ent.kind === "power" ? 1.05 : magnet ? 2.3 : 0.95;
        if (sweptNear(ent.z, dz, reachZ) && dx < reachX && yOk) {
          ent.active = false;
          ent.mesh.visible = false;
          if (ent.kind === "power") {
            this.grantPower(ent.tag);
          } else {
            this.coins += 1;
            this.combo += 1;
            this.comboT = 3.2;
            const mult = Math.min(5, 1 + Math.floor(this.combo / 4)) * (this.surgeT > 0 ? 2 : 1);
            this.points += 10 * mult;
            this.flash = mult > 1 ? `x${mult}` : "+APE";
            this.flashT = 0.35;
            this.sfx.coin();
          }
        }
        continue;
      }
      if (this.aliveFor < 0.4) continue;
      let yHit = false;
      if (ent.kind === "train") yHit = body.top > 0.05 && body.bot < 2.45;
      else if (ent.kind === "barrier") yHit = body.bot < 0.88;
      else yHit = body.top > 1.18 && body.bot < 2.2;
      if (zHit && dx < reach && yHit) {
        if (this.shield) {
          this.shield = false;
          ent.active = false;
          ent.mesh.visible = false;
          this.flash = "SAVED";
          this.flashT = 0.55;
          this.sfx.power();
          continue;
        }
        this.die();
        return;
      }
      if (
        ent.kind === "train" &&
        zHit &&
        dx >= reach &&
        dx < LANE * 0.92 &&
        this.nearMissT <= 0
      ) {
        this.flash = "CLOSE";
        this.flashT = 0.45;
        this.nearMissT = 0.8;
      }
    }
    if (this.nearMissT > 0) this.nearMissT -= dz / Math.max(1, this.speed);
  }

  private simDead(dt: number) {
    this.deathT += dt;
    this.pitch += (SLIDE_PITCH * 0.75 - this.pitch) * Math.min(1, dt * 6);
    this.pitchGroup.rotation.x = this.pitch;
    this.yawGroup.rotation.z = Math.sin(this.deathT * 9) * 0.45;
    this.yawGroup.rotation.y = this.yaw + Math.sin(this.deathT * 3) * 0.2;
    this.rig.position.set(this.x, Math.max(0, 0.45 - this.deathT * 0.7), 0);
    this.shadow.position.x = this.x;
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.2;
  }

  private poseCharacter(dt: number) {
    const leftNow = this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.steerOverride > 0.35;
    const rightNow = this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.steerOverride < -0.35;
    const targetX = laneX(this.lane);
    let targetYaw = Math.max(-0.35, Math.min(0.35, (this.x - targetX) * 0.55));
    if (leftNow) targetYaw = 0.48;
    if (rightNow) targetYaw = -0.48;
    const k = 1 - Math.exp(-12 * dt);
    this.yaw += (targetYaw - this.yaw) * k;
    const targetPitch = this.sliding ? SLIDE_PITCH : 0;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 10);
    this.yawGroup.rotation.y = this.yaw;
    this.yawGroup.rotation.z = 0;
    this.pitchGroup.rotation.x = this.pitch;
    this.rig.position.set(this.x, this.sliding ? 0 : this.jumpY, 0);
    this.shieldRing.visible = this.shield;
    this.shieldRing.rotation.z = this.runTime * 2.4;
    this.shadow.position.x = this.x;
    this.shadow.position.z = 0.05;
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.34 * (1 - Math.min(1, this.jumpY / 1.4));
  }

  private layoutEnts() {
    for (const ent of this.ents) {
      if (!ent.active) continue;
      if (ent.kind === "coin" || ent.kind === "power") {
        const spin = ent.kind === "power" ? 2.1 : 0.575;
        ent.mesh.rotation.y = this.runTime * spin + ent.z;
        ent.mesh.position.set(
          this.entX(ent),
          ent.y + Math.sin(this.runTime * 4 + ent.z) * 0.08,
          ent.z,
        );
      } else {
        ent.mesh.position.set(this.entX(ent), 0, ent.z);
        ent.mesh.rotation.y = 0;
      }
      if (ent.z - ent.len > 10) {
        ent.active = false;
        ent.mesh.visible = false;
      }
    }
  }

  private recycleTunnel() {
    const SEG = 18;
    const dz = this.scroll;
    if (dz !== 0) {
      for (const seg of this.segments) seg.position.z += dz;
    }
    for (let n = 0; n < this.segments.length; n++) {
      let front = this.segments[0]!;
      let back = this.segments[0]!;
      for (const seg of this.segments) {
        if (seg.position.z > front.position.z) front = seg;
        if (seg.position.z < back.position.z) back = seg;
      }
      if (front.position.z <= 22) break;
      front.position.z = back.position.z - SEG;
    }
  }

  private updateCamera(dt: number) {
    const target = this.x * 0.62;
    this.camX += (target - this.camX) * (1 - Math.exp(-4.5 * dt));
    const bob = Math.sin(this.runTime * (this.phase === "run" ? 11 : 2)) * (this.phase === "run" ? 0.045 : 0.02);
    let sx = 0;
    let sy = 0;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
      const mag = this.trauma * this.trauma;
      sx = (Math.random() - 0.5) * mag * 0.45;
      sy = (Math.random() - 0.5) * mag * 0.28;
    }
    this.camera.position.set(this.camX + sx, 2.42 + bob + sy, 6.25);
    this.camera.lookAt(this.camX * 0.8, 1.15, -8);
  }

  private buffLabel() {
    const bits: string[] = [];
    if (this.combo >= 4) bits.push(`x${Math.min(5, 1 + Math.floor(this.combo / 4))}`);
    if (this.shield) bits.push("SHIELD");
    if (this.magnetT > 0) bits.push("MAGNET");
    if (this.surgeT > 0) bits.push("x2");
    return bits.join("  ");
  }

  private push(force: boolean) {
    const hud: Hud = {
      phase: this.phase,
      coins: this.coins,
      meters: Math.floor(this.meters),
      score: this.score,
      best: this.best,
      speed: this.speed,
      muted: this.muted,
      musicPaused: this.sfx.musicPaused,
      flash: this.flash,
      buff: this.buffLabel(),
      newBest: this.newBest,
      loadError: this.loadError,
      runner: this.runnerName,
      runSerial: this.runSerial,
    };
    const snap = JSON.stringify(hud);
    if (!force && snap === this.hudSnap) return;
    this.hudSnap = snap;
    this.onHud(hud);
  }

  private persist() {
    this.saveDirty = false;
    this.saveAcc = 0;
    try {
      const data: Save = { v: 1, best: this.best, muted: this.muted };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* private mode */
    }
  }
}

function sweptNear(z: number, dz: number, radius: number) {
  const lo = Math.min(z, z - dz);
  const hi = Math.max(z, z - dz);
  const closest = Math.max(lo, Math.min(hi, 0));
  return Math.abs(closest) <= radius;
}

function overlapZ(z: number, len: number, dz: number) {
  const a0 = -0.48;
  const a1 = 0.48;
  const b0 = Math.min(z, z - dz) - len / 2;
  const b1 = Math.max(z, z - dz) + len / 2;
  return a0 <= b1 && b0 <= a1;
}

function readSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { v: 1, best: 0, muted: false };
    const parsed = JSON.parse(raw) as Partial<Save>;
    return {
      v: 1,
      best: typeof parsed.best === "number" ? parsed.best : 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { v: 1, best: 0, muted: false };
  }
}

function posterTexture(title: string, sub: string) {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#14121c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ffc247";
    g.lineWidth = 10;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = "#ffc247";
    g.font = "700 42px sans-serif";
    g.textAlign = "center";
    g.fillText(title, w / 2, h * 0.42);
    g.fillStyle = "#f6f1e7";
    g.font = "500 22px sans-serif";
    g.fillText(sub, w / 2, h * 0.62);
  }, 256, 320);
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
  }
}
