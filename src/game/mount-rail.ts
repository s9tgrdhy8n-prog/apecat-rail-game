import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { mulberry32, type GhostEvent, type GhostInput, type GhostTape } from "@/game/replay";
import { Sfx } from "@/game/sfx";
import type { Hud, Nudge, Phase, RailApi, RunnerName, StageBundle } from "@/game/types";
import { runnerLabel } from "@/game/runners";

const SAVE_KEY = "apecat-rail-v1";
const LANE = 2.2;
const AHEAD = 78;
const GALLERY_PACES = [2.4, 5, 8.5, 13, 20];
const SPEED_MIN = 18;
const SPEED_MAX = 40;
const GRAVITY = 34;
const JUMP_V = 10.2;
const JUMP_CUT_V = 4.5;
const JUMP_CUT_DELAY = 0.06;
const FAST_FALL_V = -14;
const SIM_STEP = 1 / 60;
const GHOST_KEYS = ["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "ControlLeft"];
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
  tug: number;
  tag: Power | "";
  spin0: number;
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

type RunnerId = "apecat" | "boggo" | "gimbo" | "pinky" | "koko" | "spooky" | "ramdawg" | "otter" | "figge" | "thehodlr" | "afterape" | "deadbeaver";

function meshyRunner(id: RunnerId) {
  return id === "pinky" || id === "koko" || id === "spooky" || id === "ramdawg" || id === "otter" || id === "figge" || id === "thehodlr" || id === "afterape" || id === "deadbeaver";
}

/** Meshy rigs, including the new APECAT, face down the tunnel. */
function runnerYaw(id: RunnerId) {
  return id === "apecat" || id === "gimbo" || meshyRunner(id) ? Math.PI : MODEL_YAW;
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
  private stageHold = false;
  private sfx = new Sfx();
  private keys = new Set<string>();
  private steerOverride = 0;
  private wasLeft = false;
  private wasRight = false;
  private wasJump = false;
  private wasSlide = false;
  private queueJump = false;
  private queueSlide = false;

  private galleryGear = 1;
  private galleryYaw = 0;
  private galleryPitch = 0;
  private galleryPaceLock = 0;
  private lookPointer: { id: number; x: number; y: number } | null = null;
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
  private loadsLeft = 16;
  private runnerId: RunnerId = "apecat";
  private runnerName: RunnerName = "APECAT";
  private runSerial = 0;
  private roster = new Map<
    RunnerId,
    {
      id: RunnerId;
      name: RunnerName;
      model: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      clips: Map<string, THREE.AnimationAction>;
    }
  >();
  private deadSource: THREE.AnimationClip | null = null;
  private deadHipsRest = new THREE.Vector3();
  private danceSource: THREE.AnimationClip | null = null;
  private danceHipsRest = new THREE.Vector3();
  private danceRest = new Map<string, THREE.Quaternion>();
  private pinkyUnlocked = false;
  private kokoUnlocked = false;
  private spookyUnlocked = false;
  private ramdawgUnlocked = false;
  private otterUnlocked = false;
  private figgeUnlocked = false;
  private thehodlrUnlocked = false;
  private afterapeUnlocked = false;
  private deadbeaverUnlocked = false;
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
  private maxCombo = 0;
  private jumps = 0;
  private slides = 0;
  private shield = false;
  private magnetT = 0;
  private surgeT = 0;
  private pickedShield = 0;
  private pickedMagnet = 0;
  private pickedSurge = 0;
  private rushNext = false;
  private shieldRing!: THREE.Object3D;
  private shieldRings: THREE.Mesh[] = [];
  private shieldMats: THREE.MeshBasicMaterial[] = [];
  private magnetMesh: THREE.Mesh | null = null;
  private magnetPos: Float32Array | null = null;
  private powerI = 0;
  private slideLatched = false;
  private fullJump = false;
  private jumpHolds = 0;
  private slideHolds = 0;
  private jumpPulse = 0;
  private slidePulse = 0;
  private neonCyan: THREE.MeshBasicMaterial | null = null;
  private neonMag: THREE.MeshBasicMaterial | null = null;
  private neonGold: THREE.MeshBasicMaterial | null = null;
  private coinHalo: THREE.MeshBasicMaterial | null = null;
  private coinRing: THREE.MeshBasicMaterial | null = null;

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
  private roll: () => number = Math.random;
  private seed = 0;
  private hasSeed = false;
  private tape: GhostEvent[] = [];
  private tapeI = 0;
  private simTick = 0;
  private simAcc = 0;
  private recording = false;
  private replaying = false;
  private applying = false;
  private paused = false;
  private countdown = 0;
  private countdownN = 0;
  private replayDone = false;
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

  private hudSnap = "";

  constructor(canvas: HTMLCanvasElement, onHud: (h: Hud) => void) {
    this.canvas = canvas;
    this.onHud = onHud;
    const saved = readSave();
    this.best = saved.best;
    this.bestAtStart = saved.best;
    this.muted = saved.muted;
    this.sfx.setMuted(saved.muted);
    this.sfx.onTrack = () => this.push(true);

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

    this.buildShield();
    this.buildMagnetWeb();

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
      nextTrack: () => this.nextTrack(),
      nudge: (dir) => this.nudge(dir),
      hold: (action, down) => this.hold(action, down),
      toMenu: () => this.toMenu(),
      enterGallery: () => this.enterGallery(),
      galleryPace: (dir) => this.stepGalleryPace(dir),
      swap: () => this.swapRunner(),
      pick: (name) => this.pickRunner(name),
      noteBest: (score) => this.noteBest(score),
      setPinkyUnlocked: (unlocked) => {
        this.pinkyUnlocked = unlocked;
      },
      setKokoUnlocked: (unlocked) => {
        this.kokoUnlocked = unlocked;
      },
      setSpookyUnlocked: (unlocked) => {
        this.spookyUnlocked = unlocked;
      },
      setRamdawgUnlocked: (unlocked) => {
        this.ramdawgUnlocked = unlocked;
      },
      setOtterUnlocked: (unlocked) => {
        this.otterUnlocked = unlocked;
      },
      setFiggeUnlocked: (unlocked) => {
        this.figgeUnlocked = unlocked;
      },
      setThehodlrUnlocked: (unlocked) => {
        this.thehodlrUnlocked = unlocked;
      },
      setAfterapeUnlocked: (unlocked) => {
        this.afterapeUnlocked = unlocked;
      },
      setDeadbeaverUnlocked: (unlocked) => {
        this.deadbeaverUnlocked = unlocked;
      },
      pause: () => this.freeze(),
      resume: () => this.beginCountdown(),
      playReplay: (tape) => this.playReplay(tape),
      takeGhost: () => this.takeGhost(),
      takeStage: (name) => this.takeStage(name),
      holdStage: (on) => {
        this.stageHold = on;
        if (!on) this.clockLast = -1;
      },
    };
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onGesture);
    window.removeEventListener("pointerdown", this.onLookDown);
    window.removeEventListener("pointermove", this.onLookMove);
    window.removeEventListener("pointerup", this.onLookUp);
    window.removeEventListener("pointercancel", this.onLookUp);
    window.removeEventListener("wheel", this.onGalleryWheel);
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
    window.addEventListener("pointerdown", this.onLookDown);
    window.addEventListener("pointermove", this.onLookMove);
    window.addEventListener("pointerup", this.onLookUp);
    window.addEventListener("pointercancel", this.onLookUp);
    window.addEventListener("wheel", this.onGalleryWheel, { passive: false });
    window.addEventListener("resize", this.resize);
    window.visualViewport?.addEventListener("resize", this.resize);
  }

  private onGesture = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".rail-pause, .rail-track")) return;
    this.sfx.startMusic();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return;
    if (e.code === "Escape") {
      e.preventDefault();
      if (this.phase === "gallery" || this.phase === "replay") this.toMenu();
      else if (this.phase === "run") this.togglePause();
      return;
    }
    if (this.phase === "run" && (this.paused || this.countdown > 0)) return;
    if (this.phase === "replay") return;
    if (this.phase === "gallery") {
      if (e.code === "Escape" || e.code === "Tab") {
        if (e.code === "Escape") this.toMenu();
        return;
      }
      if (e.code === "KeyW" || e.code === "Equal" || e.code === "NumpadAdd" || e.code === "ArrowUp") {
        this.stepGalleryPace(1);
        return;
      }
      if (e.code === "KeyS" || e.code === "Minus" || e.code === "NumpadSubtract" || e.code === "ArrowDown") {
        this.stepGalleryPace(-1);
        return;
      }
    }
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
    if (GHOST_KEYS.includes(e.code)) this.note({ k: "key", code: e.code, down: true });
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.keys.has(e.code)) return;
    this.keys.delete(e.code);
    if (GHOST_KEYS.includes(e.code)) this.note({ k: "key", code: e.code, down: false });
  };

  private onBlur = () => {
    this.releaseGhostKeys();
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
    const specs: { id: RunnerId; name: RunnerName; url: string }[] = [
      { id: "apecat", name: "APECAT", url: "/models/apecat_rail.glb" },
      { id: "boggo", name: "BOGGY", url: "/models/boggo.glb" },
      { id: "gimbo", name: "GIMBO", url: "/models/gimbo.glb" },
      { id: "pinky", name: "PINKY", url: "/models/pinky.glb" },
      { id: "koko", name: "KOKO", url: "/models/koko.glb" },
      { id: "spooky", name: "SPOOKY", url: "/models/spooky.glb" },
      { id: "ramdawg", name: "RAMDAWG", url: "/models/ramdawg.glb" },
      { id: "otter", name: "OTTER", url: "/models/otter.glb" },
      { id: "figge", name: "FIGGE", url: "/models/figge.glb" },
      { id: "thehodlr", name: "THEHODLR", url: "/models/thehodlr.glb" },
      { id: "afterape", name: "AFTERAPE", url: "/models/afterape.glb" },
      { id: "deadbeaver", name: "DEADBEAVER", url: "/models/deadbeaver.glb" },
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
          const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              const maps = [
                (mat as THREE.MeshStandardMaterial).map,
                (mat as THREE.MeshStandardMaterial).normalMap,
                (mat as THREE.MeshStandardMaterial).roughnessMap,
                (mat as THREE.MeshStandardMaterial).metalnessMap,
                (mat as THREE.MeshStandardMaterial).aoMap,
                (mat as THREE.MeshStandardMaterial).emissiveMap,
              ];
              for (const tex of maps) {
                if (!tex) continue;
                tex.anisotropy = anisotropy;
                tex.magFilter = THREE.LinearFilter;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.generateMipmaps = true;
                tex.needsUpdate = true;
              }
              // This export paints the fur as metal, which hides the color map in the tunnel.
              if (spec.id === "gimbo") {
                const std = mat as THREE.MeshStandardMaterial;
                std.metalnessMap = null;
                std.metalness = 0;
                std.needsUpdate = true;
              }
            }
          });
          this.fitGroup.add(model);
          const mixer = new THREE.AnimationMixer(model);
          const clips = new Map<string, THREE.AnimationAction>();
          for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip);
            const canon = clip.name === "Running" ? "Run" : clip.name === "Walking" ? "Walk" : clip.name;
            if (canon === "Dead") {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            } else {
              action.loop = THREE.LoopRepeat;
              action.clampWhenFinished = false;
            }
            clips.set(canon, action);
          }
          if (!clips.has("Idle")) {
            const idle = clips.get("Walk") ?? clips.get("Run");
            if (idle) clips.set("Idle", idle);
          }
          if (spec.id === "pinky") {
            this.deadSource = gltf.animations.find((clip) => clip.name === "Dead") ?? null;
            const hips = model.getObjectByName("mixamorig:Hips");
            if (hips) this.deadHipsRest.copy(hips.position);
          }
          if (!this.danceSource) {
            const dance = gltf.animations.find((clip) => /dance/i.test(clip.name)) ?? null;
            if (dance) {
              this.danceSource = dance;
              const hips = model.getObjectByName("mixamorig:Hips");
              if (hips) this.danceHipsRest.copy(hips.position);
              this.danceRest.clear();
              model.traverse((obj) => {
                if (obj.name) this.danceRest.set(obj.name, obj.quaternion.clone());
              });
            }
          }
          const fit = spec.id === "boggo" ? 1.2 : meshyRunner(spec.id) ? 1.3 : 0.7;
          const yaw = runnerYaw(spec.id);
          this.fitModel(model, fit, yaw);
          this.roster.set(spec.id, { id: spec.id, name: spec.name, model, mixer, clips });
          this.giveDeadToAll();
          this.giveDanceToAll();
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

  private giveDeadToAll() {
    if (!this.deadSource) return;
    for (const runner of this.roster.values()) {
      const existing = runner.clips.get("Dead");
      if (existing) {
        existing.setLoop(THREE.LoopOnce, 1);
        existing.clampWhenFinished = true;
        continue;
      }
      const clip = this.retargetClip(this.deadSource, runner.model, this.deadHipsRest);
      const action = runner.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      runner.clips.set("Dead", action);
    }
  }

  /** Keep this rig's bone lengths. Another character's position tracks stretch the neck and limbs. */
  private retargetClip(source: THREE.AnimationClip, model: THREE.Object3D, sourceHips: THREE.Vector3) {
    const clip = source.clone();
    const hips = model.getObjectByName("mixamorig:Hips");
    const rest = hips ? hips.position : sourceHips;
    clip.tracks = clip.tracks.filter((track) => {
      if (!track.name.endsWith(".position")) return true;
      if (!/hips/i.test(track.name)) return false;
      const values = track.values;
      for (let i = 0; i < values.length; i += 3) {
        const bounce = values[i + 1] - sourceHips.y;
        values[i] = rest.x;
        values[i + 1] = rest.y + bounce;
        values[i + 2] = rest.z;
      }
      return true;
    });
    return clip;
  }

  /** TheHoldr's head bone is already turned in the bind pose. Dance keys from another rig replace that and pull the neck. */
  private keepHeadRest(clip: THREE.AnimationClip, model: THREE.Object3D) {
    const dest = new Map<string, THREE.Quaternion>();
    model.traverse((obj) => {
      if (obj.name) dest.set(obj.name, obj.quaternion);
    });
    const key = new THREE.Quaternion();
    const delta = new THREE.Quaternion();
    const out = new THREE.Quaternion();
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      const bone = track.name.slice(0, -".quaternion".length);
      if (!/head|neck/i.test(bone)) continue;
      const srcRest = this.danceRest.get(bone);
      const dstRest = dest.get(bone);
      if (!srcRest || !dstRest) continue;
      const values = track.values;
      for (let i = 0; i < values.length; i += 4) {
        key.fromArray(values, i);
        delta.copy(srcRest).invert().multiply(key);
        out.copy(dstRest).multiply(delta).normalize();
        out.toArray(values, i);
      }
    }
  }

  private giveDanceToAll() {
    if (!this.danceSource) return;
    for (const runner of this.roster.values()) {
      const hasDance = [...runner.clips.keys()].some((name) => /dance/i.test(name));
      if (hasDance) continue;
      const clip = this.retargetClip(this.danceSource, runner.model, this.danceHipsRest);
      if (runner.id === "thehodlr") this.keepHeadRest(clip, runner.model);
      const action = runner.mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      runner.clips.set(clip.name, action);
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

  private activate(id: RunnerId, announce: boolean) {
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
    this.play(this.phase === "dead" ? "Dead" : "Run", 0);
    if (announce) {
      this.flash = runnerLabel(next.name);
      this.flashT = 0.8;
    }
    this.push(true);
  }

  private lockedRunner(name: RunnerName) {
    if (name === "PINKY") return !this.pinkyUnlocked;
    if (name === "KOKO") return !this.kokoUnlocked;
    if (name === "SPOOKY") return !this.spookyUnlocked;
    if (name === "RAMDAWG") return !this.ramdawgUnlocked;
    if (name === "OTTER") return !this.otterUnlocked;
    if (name === "FIGGE") return !this.figgeUnlocked;
    if (name === "THEHODLR") return !this.thehodlrUnlocked;
    if (name === "AFTERAPE") return !this.afterapeUnlocked;
    if (name === "DEADBEAVER") return !this.deadbeaverUnlocked;
    return false;
  }

  private pickRunner(name: RunnerName) {
    if (!this.modelReady) return;
    if (this.lockedRunner(name) && this.phase === "run") return;
    const id: RunnerId =
      name === "APECAT"
        ? "apecat"
        : name === "BOGGY"
          ? "boggo"
          : name === "PINKY"
            ? "pinky"
            : name === "KOKO"
              ? "koko"
              : name === "SPOOKY"
                ? "spooky"
                : name === "RAMDAWG"
                  ? "ramdawg"
                  : name === "OTTER"
                  ? "otter"
                  : name === "FIGGE"
                    ? "figge"
                    : name === "THEHODLR"
                      ? "thehodlr"
                      : name === "AFTERAPE"
                        ? "afterape"
                        : name === "DEADBEAVER"
                          ? "deadbeaver"
                          : "gimbo";
    if (!this.roster.has(id) || id === this.runnerId) return;
    this.activate(id, true);
  }

  private swapRunner() {
    if (!this.modelReady) return;
    const order: RunnerId[] = ["apecat", "boggo", "gimbo", "pinky", "koko", "spooky", "ramdawg", "otter", "figge", "thehodlr", "afterape", "deadbeaver"];
    const available = order.filter((id) => {
      if (!this.roster.has(id)) return false;
      const name = this.roster.get(id)?.name;
      if (name && this.lockedRunner(name) && this.phase === "run") return false;
      return true;
    });
    if (available.length === 0) return;
    const i = Math.max(0, available.indexOf(this.runnerId));
    const next = available[(i + 1) % available.length];
    if (next && next !== this.runnerId) this.activate(next, true);
  }

  private fitModel(model: THREE.Object3D, extra = 1, yaw = MODEL_YAW) {
    model.rotation.y = yaw;
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
      ...[
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
        "7m",
        "8m",
        "10m",
        "11m",
        "12m",
        "13m",
        "14m",
        "15m",
        "16m",
        "17m",
        "19m",
        "20m",
        "22",
        "23m",
        "25m",
        "26m",
        "28m",
        "29m",
        "30m",
        "43m",
      ].map((name) => `/textures/walls/Ape_${name}.png`),
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
    const open: number[] = [];
    for (let i = 3; i < n; i++) if (!banned.has(i)) open.push(i);
    if (open.length === 0) return 3;
    return open[Math.floor(Math.random() * open.length)]!;
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
    this.loadCoins();
    this.loadPowers();
  }

  private buildShield() {
    const hues = [0.5, 0.76, 0.9];
    const shield = new THREE.Group();
    const rings: { radius: number; tube: number; tilt: number }[] = [
      { radius: 0.98, tube: 0.022, tilt: Math.PI / 2 },
      { radius: 0.9, tube: 0.016, tilt: 0.42 },
      { radius: 0.82, tube: 0.014, tilt: 1.2 },
    ];
    rings.forEach((spec, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hues[i]!, 1, 0.55),
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.tube, 8, 56), mat);
      ring.rotation.x = spec.tilt;
      ring.frustumCulled = false;
      shield.add(ring);
      this.shieldRings.push(ring);
      this.shieldMats.push(mat);
    });
    shield.position.y = 0.95;
    shield.visible = false;
    this.shieldRing = shield;
    this.rig.add(shield);
  }

  private buildMagnetWeb() {
    const chains = 18;
    const segs = 8;
    const verts = chains * (segs + 1) * 2;
    const pos = new Float32Array(verts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let c = 0; c < chains; c++) {
      const base = c * (segs + 1) * 2;
      for (let s = 0; s < segs; s++) {
        const a = base + s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xff1493,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    this.magnetMesh = mesh;
    this.magnetPos = pos;
  }

  private coinInMagnet(ent: Ent) {
    if (ent.z > 1.15 || ent.z < -3.2) return false;
    const dx = Math.abs(laneX(ent.lane) + ent.tug - this.x);
    if (dx > 0.45 && dx < LANE * 1.35) return true;
    if (dx > 1.15) return false;
    const above = ent.y > this.jumpY + 1.15;
    const below = this.jumpY > 0.55 && ent.y < this.jumpY + 0.15;
    return above || below;
  }

  private tugCoin(ent: Ent, dz: number) {
    if (this.magnetT <= 0 || !this.coinInMagnet(ent)) return;
    const x = laneX(ent.lane) + ent.tug;
    const k = Math.min(0.55, dz * 0.45);
    ent.tug += (this.x - x) * k;
  }

  private updateMagnetChains() {
    const mesh = this.magnetMesh;
    const pos = this.magnetPos;
    if (!mesh || !pos) return;
    if (this.magnetT <= 0) {
      mesh.visible = false;
      return;
    }
    const segs = 8;
    const max = 18;
    const oy = 1.05 + this.jumpY * 0.35;
    let n = 0;
    for (const ent of this.ents) {
      if (n >= max || !ent.active || ent.kind !== "coin" || !this.coinInMagnet(ent)) continue;
      const end = ent.mesh.position;
      const base = n * (segs + 1) * 2;
      const dx = end.x - this.x;
      const dz = end.z - 0.3;
      const span = Math.hypot(dx, dz) || 1;
      const sx = -dz / span;
      const sz = dx / span;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const wave = Math.sin(t * Math.PI) * 0.22 + Math.sin(this.runTime * 16 + n * 1.7 + t * 11) * 0.03;
        const x = this.x + dx * t;
        const y = oy + (end.y - oy) * t + wave;
        const z = 0.3 + dz * t;
        const w = 0.032 + (s % 2 === 0 ? 0.012 : 0);
        const i0 = (base + s * 2) * 3;
        pos[i0] = x + sx * w;
        pos[i0 + 1] = y;
        pos[i0 + 2] = z + sz * w;
        pos[i0 + 3] = x - sx * w;
        pos[i0 + 4] = y;
        pos[i0 + 5] = z - sz * w;
      }
      n += 1;
    }
    for (let c = n; c < max; c++) {
      const base = c * (segs + 1) * 2;
      for (let s = 0; s <= segs; s++) {
        const i0 = (base + s * 2) * 3;
        pos[i0] = pos[i0 + 1] = pos[i0 + 2] = 0;
        pos[i0 + 3] = pos[i0 + 4] = pos[i0 + 5] = 0;
      }
    }
    const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n * segs * 6);
    mesh.visible = n > 0;
  }

  private loadPowers() {
    const specs: { tag: Power; color: number; url: string }[] = [
      { tag: "shield", color: 0x3dfff6, url: "/models/Shield_Skull_AC.glb" },
      { tag: "magnet", color: 0xff2bd6, url: "/models/Magnet_Skull.glb" },
      { tag: "surge", color: 0xffe14a, url: "/models/Surge_Skull_AC.glb" },
    ];
    const loader = new GLTFLoader();
    let pending = specs.length;
    const finish = () => {
      pending -= 1;
      if (pending === 0) this.settleLoad();
    };
    for (const spec of specs) {
      loader.load(spec.url, (gltf) => {
        if (this.disposed) return;
        const src = gltf.scene;
        src.updateMatrixWorld(true);
        const glow = new THREE.Color(spec.color);
        src.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            const std = mat as THREE.MeshStandardMaterial;
            if (!std.isMeshStandardMaterial) continue;
            std.emissive = glow;
            if (std.map) std.emissiveMap = std.map;
            std.emissiveIntensity = 0.72;
            std.needsUpdate = true;
          }
        });
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 0.81 / Math.max(0.01, size.y);
        const haloMat = new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          fog: false,
        });
        for (let i = 0; i < 4; i++) {
          const group = new THREE.Group();
          const skull = src.clone(true);
          skull.name = "power-icon";
          skull.scale.setScalar(s);
          skull.position.set(-center.x * s, -center.y * s, -center.z * s);
          const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), haloMat);
          halo.frustumCulled = false;
          group.add(halo, skull);
          const ent = this.makeEnt("power", group, 0.9, 0.7);
          ent.tag = spec.tag;
          ent.y = 1.15;
          this.ents.push(ent);
        }
        finish();
      }, undefined, () => finish());
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
        this.addBearNeon(group, 1.9, size.y * s, 0, depth);
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
        this.addBearNeon(group, size.x * s, 0.82, 0, depth);
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
        this.addBearNeon(group, size.x * s, 0.82, 1.28, depth);
        this.ents.push(this.makeEnt("sign", group, Math.max(0.55, depth), Math.min(0.78, halfW)));
      }
      this.settleLoad();
    }, undefined, () => this.settleLoad());
  }

  private loadCoins() {
    const loader = new GLTFLoader();
    loader.load("/models/apecat_coin.glb", (gltf) => {
      if (this.disposed) return;
      const src = gltf.scene;
      src.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
      });
      const box = new THREE.Box3().setFromObject(src);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const face = 0.72 * 0.6;
      const base = face / Math.max(size.x, size.y, size.z);
      const thin = size.x <= size.y && size.x <= size.z ? "x" : size.y <= size.z ? "y" : "z";
      const scale = new THREE.Vector3(base, base, base);
      scale[thin] = (0.72 / Math.max(size.x, size.y, size.z)) * 1.2;
      const radius = face * 0.52;
      this.ensureNeonMats();
      for (let i = 0; i < 70; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Group();
        const coin = src.clone(true);
        coin.scale.copy(scale);
        coin.position.set(-center.x * scale.x, -center.y * scale.y, -center.z * scale.z);
        coin.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        const halo = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.35, 28), this.coinHalo!);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.028, 8, 28), this.coinRing!);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.16, 0.012, 6, 28), this.coinRing!);
        for (const glow of [halo, ring, rim]) {
          glow.frustumCulled = false;
          if (thin === "y") glow.rotation.x = Math.PI / 2;
          else if (thin === "x") glow.rotation.y = Math.PI / 2;
          spin.add(glow);
        }
        spin.add(coin);
        group.add(spin);
        this.ents.push(this.makeEnt("coin", group, 0.4, 0.32));
      }
      this.settleLoad();
    }, undefined, () => this.settleLoad());
  }

  private ensureNeonMats() {
    if (this.neonCyan) return;
    const make = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    this.neonCyan = make(0x3dfff6, 0.95);
    this.neonMag = make(0xff2bd6, 0.8);
    this.neonGold = make(0xffc247, 0.9);
    this.coinRing = make(0x2f6bff, 0.95);
    this.coinHalo = make(0x2f6bff, 0.28);
  }

  private addBearNeon(parent: THREE.Object3D, width: number, height: number, footY: number, depth: number) {
    this.ensureNeonMats();
    const z = depth * 0.55 + 0.05;
    const mid = footY + height * 0.5;
    const t = 0.05;
    const bar = (mat: THREE.Material, w: number, h: number, x: number, y: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), mat);
      mesh.position.set(x, y, z);
      mesh.frustumCulled = false;
      parent.add(mesh);
    };
    bar(this.neonCyan!, t, height + 0.18, -width * 0.54, mid);
    bar(this.neonMag!, t, height + 0.18, width * 0.54, mid);
    bar(this.neonGold!, width + 0.18, t, 0, footY + height + 0.08);
    bar(this.neonCyan!, width * 0.72, t * 0.65, 0, footY + 0.06);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.35, width * 0.42), 0.03, 8, 24),
      this.neonGold!,
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, footY + 0.04, 0);
    halo.frustumCulled = false;
    parent.add(halo);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(width * 0.28, 0.018, 6, 20), this.neonMag!);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, footY + height + 0.12, z * 0.3);
    crown.frustumCulled = false;
    parent.add(crown);
  }

  private makeEnt(kind: Kind, mesh: THREE.Object3D, len: number, halfW: number): Ent {
    mesh.visible = false;
    this.scene.add(mesh);
    return { kind, mesh, active: false, lane: 0, z: 0, len, y: 0, halfW, drift: 0, tug: 0, tag: "", spin0: 0 };
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
    ent.tug = 0;
    ent.spin0 = (lane * 2.15 + z * 2.51) % (Math.PI * 2);
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

  private nextPower(): Power {
    const order: Power[] = ["shield", "surge", "magnet"];
    const tag = order[this.powerI % order.length]!;
    this.powerI += 1;
    return tag;
  }

  private spawnPower(tag: Power, lane: number, z: number) {
    const ent = this.ents.find((item) => item.kind === "power" && item.tag === tag && !item.active);
    if (!ent) return;
    ent.active = true;
    ent.lane = lane;
    ent.z = z;
    ent.y = 1.15;
    ent.drift = 0;
    ent.tug = 0;
    ent.spin0 = (lane * 2.15 + z * 2.51) % (Math.PI * 2);
    ent.mesh.visible = true;
    ent.mesh.position.set(laneX(lane), ent.y, z);
  }

  private dropPower(cells: Cell[], z: number) {
    if (this.spawned === 0) {
      this.spawnPower("shield", 0, z - 8);
      return;
    }
    const open = cells
      .map((cell, index) => (cell === "empty" ? index : -1))
      .filter((index) => index >= 0);
    if (!open.length) return;
    if (this.roll() > (this.spawned < INTRO.length ? 0.5 : 0.4)) return;
    this.spawnPower(this.nextPower(), open[Math.floor(this.roll() * open.length)]! - 1, z);
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
    if (!opts.length || this.roll() > 0.25 + this.heat() * 0.5) return;
    const pick = opts[Math.floor(this.roll() * opts.length)]!;
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
    const row = pool[Math.floor(this.roll() * pool.length)] ?? ["empty", "coins", "empty"];
    const shift = 0.28 + h * 0.45;
    if (this.roll() < shift) {
      const neigh = [this.safe - 1, this.safe + 1].filter(
        (j) => j >= 0 && j < 3 && row[j] !== "train",
      );
      if (neigh.length) this.safe = neigh[Math.floor(this.roll() * neigh.length)]!;
    }
    return row;
  }

  private ensureTrack() {
    let guard = 0;
    while (this.endZ > -AHEAD && guard++ < 20) {
      let gap = this.gap();
      if (this.rushNext) gap = Math.max(15, gap * 0.58);
      this.rushNext = this.heat() > 0.38 && this.roll() < 0.36;
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
    if (!this.modelReady || this.phase === "run" || this.phase === "replay" || this.phase === "loading" || this.phase === "gallery") return;
    if (this.lockedRunner(this.runnerName)) {
      this.flash = "169 Diamond Skulls";
      this.flashT = 1.6;
      this.push(true);
      return;
    }
    this.sfx.unlock();
    this.sfx.startMusic();
    this.sfx.startRumble();
    this.beginAttempt(Math.floor(Math.random() * 0x100000000));
    this.recording = true;
    this.phase = "run";
    this.play("Run");
    this.push(true);
  }

  private beginAttempt(seed: number) {
    this.roll = mulberry32(seed);
    this.seed = seed >>> 0;
    this.hasSeed = true;
    this.tape = [];
    this.tapeI = 0;
    this.simTick = 0;
    this.simAcc = 0;
    this.recording = false;
    this.replaying = false;
    this.applying = false;
    this.paused = false;
    this.countdown = 0;
    this.countdownN = 0;
    this.replayDone = false;
    this.coins = 0;
    this.meters = 0;
    this.score = 0;
    this.points = 0;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.jumps = 0;
    this.slides = 0;
    this.shield = false;
    this.magnetT = 0;
    this.surgeT = 0;
    this.pickedShield = 0;
    this.pickedMagnet = 0;
    this.pickedSurge = 0;
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
    this.clearHolds();
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
    this.powerI = 0;
    this.slideLatched = false;
    this.fullJump = false;
    this.safe = 1;
    this.endZ = 12;
    this.bestAtStart = this.best;
    this.keys.delete("Space");
    this.keys.delete("KeyW");
    this.keys.delete("ArrowUp");
    this.clearEnts();
    this.ensureTrack();
  }

  private playReplay(tape: GhostTape) {
    if (!this.modelReady || this.phase === "loading") return;
    const id = this.runnerIdFor(tape.runner);
    if (!this.roster.has(id)) return;
    this.activate(id, false);
    this.beginAttempt(tape.seed);
    this.tape = tape.events;
    this.recording = false;
    this.replaying = true;
    this.phase = "replay";
    this.sfx.unlock();
    this.sfx.startMusic();
    this.sfx.startRumble();
    this.play("Run");
    this.push(true);
  }

  private runnerIdFor(name: RunnerName): RunnerId {
    if (name === "APECAT") return "apecat";
    if (name === "BOGGY") return "boggo";
    if (name === "PINKY") return "pinky";
    if (name === "KOKO") return "koko";
    if (name === "SPOOKY") return "spooky";
    if (name === "RAMDAWG") return "ramdawg";
    if (name === "OTTER") return "otter";
    if (name === "FIGGE") return "figge";
    if (name === "THEHODLR") return "thehodlr";
    if (name === "AFTERAPE") return "afterape";
    if (name === "DEADBEAVER") return "deadbeaver";
    return "gimbo";
  }

  private takeStage(name: RunnerName): StageBundle | null {
    const runner = this.roster.get(this.runnerIdFor(name));
    if (!runner) return null;
    const model = cloneSkinned(runner.model) as THREE.Object3D;
    model.visible = true;
    let run: THREE.AnimationClip | null = runner.clips.get("Run")?.getClip() ?? runner.clips.get("Walk")?.getClip() ?? null;
    let dance: THREE.AnimationClip | null = null;
    for (const [clipName, action] of runner.clips) {
      if (/dance/i.test(clipName)) dance = action.getClip();
    }
    return { model, run, dance };
  }

  private takeGhost(): GhostTape | null {
    if (!this.hasSeed || this.replaying) return null;
    const tape: GhostTape = { seed: this.seed, runner: this.runnerName, events: this.tape };
    this.recording = false;
    return tape;
  }

  private note(event: GhostInput) {
    if (!this.recording || this.replaying || this.applying || this.paused || this.countdown > 0) return;
    if (this.phase !== "run") return;
    if (this.tape.length >= 8000) return;
    this.tape.push({ ...event, t: this.simTick } as GhostEvent);
  }

  private releaseGhostKeys() {
    for (const code of GHOST_KEYS) {
      if (!this.keys.has(code)) continue;
      this.keys.delete(code);
      this.note({ k: "key", code, down: false });
    }
    if (this.jumpHolds > 0) {
      this.jumpHolds = 0;
      this.note({ k: "hold", action: "jump", down: false });
    }
    if (this.slideHolds > 0) {
      this.slideHolds = 0;
      this.note({ k: "hold", action: "slide", down: false });
    }
  }

  private freeze() {
    if (this.phase !== "run" || this.paused || this.countdown > 0) return;
    this.releaseGhostKeys();
    this.paused = true;
    this.simAcc = 0;
    this.push(true);
  }

  private beginCountdown() {
    if (this.phase !== "run" || !this.paused || this.countdown > 0) return;
    this.paused = false;
    this.countdown = 3;
    this.countdownN = 3;
    this.simAcc = 0;
    this.releaseGhostKeys();
    this.push(true);
  }

  private togglePause() {
    if (this.phase === "replay") {
      this.toMenu();
      return;
    }
    if (this.phase !== "run" || this.countdown > 0) return;
    if (this.paused) this.beginCountdown();
    else this.freeze();
  }

  private applyTape() {
    this.applying = true;
    while (this.tapeI < this.tape.length && this.tape[this.tapeI]!.t <= this.simTick) {
      const event = this.tape[this.tapeI]!;
      this.tapeI += 1;
      if (event.t !== this.simTick) continue;
      if (event.k === "key") {
        if (event.down) this.keys.add(event.code);
        else this.keys.delete(event.code);
      } else if (event.k === "hold") this.hold(event.action, event.down);
      else this.nudge(event.dir);
    }
    this.applying = false;
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

  private nextTrack() {
    this.sfx.nextTrack();
    this.push(true);
  }

  private nudge(dir: Nudge) {
    const live = this.phase === "run" || (this.phase === "replay" && this.applying);
    if (!live || this.paused || this.countdown > 0) return;
    if (this.phase === "run" && !this.applying) this.note({ k: "nudge", dir });
    if (dir === -1) this.requestLane(-1);
    else if (dir === 1) this.requestLane(1);
    else if (dir === "jump") {
      this.queueJump = true;
      this.jumpPulse = 0.12;
    } else {
      this.queueSlide = true;
      this.slidePulse = 0.12;
    }
  }

  /** Finger down matches a key. Finger up cuts the jump or stands up from a duck. */
  private hold(action: "jump" | "slide", down: boolean) {
    if (this.replaying && !this.applying) return;
    if (this.paused || this.countdown > 0) return;
    if (down) {
      if (action === "jump") this.jumpHolds += 1;
      else this.slideHolds += 1;
      if (this.phase === "run" && !this.applying) this.note({ k: "hold", action, down: true });
      if (this.phase !== "run" && this.phase !== "replay") return;
      if (action === "jump") this.queueJump = true;
      else this.queueSlide = true;
      return;
    }
    if (action === "jump") this.jumpHolds = Math.max(0, this.jumpHolds - 1);
    else this.slideHolds = Math.max(0, this.slideHolds - 1);
    if (this.phase === "run" && !this.applying) this.note({ k: "hold", action, down: false });
  }

  private clearHolds() {
    this.jumpHolds = 0;
    this.slideHolds = 0;
    this.jumpPulse = 0;
    this.slidePulse = 0;
    this.queueJump = false;
    this.queueSlide = false;
  }

  private enterGallery() {
    if (this.phase !== "menu") return;
    this.phase = "gallery";
    this.galleryGear = 1;
    this.galleryYaw = 0;
    this.galleryPitch = 0;
    this.galleryPaceLock = 0;
    this.lookPointer = null;
    this.speed = GALLERY_PACES[1]!;
    this.scroll = 0;
    this.clearEnts();
    this.sfx.playGallery();
    this.push(true);
  }

  private stepGalleryPace(dir: -1 | 1, fromWheel = false) {
    if (this.phase !== "gallery") return;
    if (fromWheel && this.runTime < this.galleryPaceLock) return;
    const next = Math.max(0, Math.min(GALLERY_PACES.length - 1, this.galleryGear + dir));
    if (next === this.galleryGear) return;
    if (fromWheel) this.galleryPaceLock = this.runTime + 0.16;
    this.galleryGear = next;
    this.speed = GALLERY_PACES[next]!;
    this.push(true);
  }

  private onLookDown = (e: PointerEvent) => {
    if (this.phase !== "gallery" || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea")) return;
    this.lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  private onLookMove = (e: PointerEvent) => {
    if (!this.lookPointer || this.lookPointer.id !== e.pointerId) return;
    const dx = e.clientX - this.lookPointer.x;
    const dy = e.clientY - this.lookPointer.y;
    this.lookPointer.x = e.clientX;
    this.lookPointer.y = e.clientY;
    this.galleryYaw = Math.max(-1.25, Math.min(1.25, this.galleryYaw + dx * 0.0042));
    this.galleryPitch = Math.max(-0.55, Math.min(0.62, this.galleryPitch - dy * 0.0036));
  };

  private onLookUp = (e: PointerEvent) => {
    if (this.lookPointer?.id === e.pointerId) this.lookPointer = null;
  };

  private onGalleryWheel = (e: WheelEvent) => {
    if (this.phase !== "gallery") return;
    e.preventDefault();
    this.stepGalleryPace(e.deltaY > 0 ? -1 : 1, true);
  };

  private simGallery(dt: number) {
    const glance = 0.85 * dt;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) {
      this.galleryYaw = Math.max(-1.25, this.galleryYaw - glance);
    }
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) {
      this.galleryYaw = Math.min(1.25, this.galleryYaw + glance);
    }
    this.speed = GALLERY_PACES[this.galleryGear] ?? GALLERY_PACES[1]!;
    this.scroll = this.speed * dt;
  }

  private toMenu() {
    if (this.phase === "gallery") {
      this.phase = "menu";
      this.lookPointer = null;
      this.galleryYaw = 0;
      this.galleryPitch = 0;
      this.speed = 0;
      this.scroll = 0;
      this.sfx.useRunMusic();
      this.push(true);
      return;
    }
    if (this.phase !== "dead" && this.phase !== "run" && this.phase !== "replay") return;
    this.phase = "menu";
    this.paused = false;
    this.countdown = 0;
    this.countdownN = 0;
    this.recording = false;
    this.replaying = false;
    this.replayDone = false;
    this.simAcc = 0;
    this.speed = 0;
    this.scroll = 0;
    this.deathT = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.sliding = false;
    this.slideT = 0;
    this.slideLatched = false;
    this.fullJump = false;
    this.jumpY = 0;
    this.vy = 0;
    this.grounded = true;
    this.shield = false;
    this.shieldRing.visible = false;
    this.rig.position.set(0, 0, 0);
    this.yawGroup.rotation.set(0, 0, 0);
    this.pitchGroup.rotation.set(0, 0, 0);
    this.lane = 0;
    this.x = 0;
    this.clearHolds();
    this.clearEnts();
    this.introI = 0;
    this.spawned = 0;
    this.endZ = 12;
    this.ensureTrack();
    this.mixer?.stopAllAction();
    this.current = null;
    const run = this.clips.get("Run") ?? this.clips.get("Walk") ?? this.clips.get("Idle");
    if (run) {
      run.reset();
      run.enabled = true;
      run.setEffectiveWeight(1);
      run.play();
      this.current = run;
    }
    this.push(true);
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
      if (this.vy > FAST_FALL_V) this.vy = FAST_FALL_V;
      return;
    }
    this.sliding = true;
    this.slideT = 0.62;
    this.slides += 1;
    this.sfx.slide();
  }

  private body(): { bot: number; top: number } {
    if (this.sliding) return { bot: 0.02, top: 0.58 };
    return { bot: this.jumpY + 0.04, top: this.jumpY + 1.62 };
  }

  private die() {
    if (this.phase === "replay") {
      if (this.replayDone) return;
      this.replayDone = true;
      this.recording = false;
      this.speed = 0;
      this.clearHolds();
      this.shield = false;
      this.shieldRing.visible = false;
      this.trauma = 1;
      this.sfx.die();
      this.playDead();
      this.flash = "Replay over";
      this.flashT = 2.4;
      this.push(true);
      return;
    }
    if (this.phase !== "run") return;
    this.phase = "dead";
    this.recording = false;
    this.speed = 0;
    this.clearHolds();
    this.shield = false;
    this.shieldRing.visible = false;
    this.trauma = 1;
    this.newBest = this.score > this.bestAtStart && this.score > 0;
    if (this.score > this.best) this.best = this.score;
    this.runSerial += 1;
    this.sfx.die();
    this.playDead();
    this.persist();
    this.push(true);
  }

  private playDead() {
    const dead = this.clips.get("Dead");
    if (!dead) return;
    if (this.current && this.current !== dead) this.current.fadeOut(0.08);
    dead.setLoop(THREE.LoopOnce, 1);
    dead.clampWhenFinished = true;
    dead.reset().fadeIn(0.08).play();
    this.current = dead;
  }

  private frame(t: number) {
    if (this.disposed) return;
    if (this.clockLast < 0) this.clockLast = t;
    if (document.hidden || this.stageHold) {
      this.clockLast = t;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (t - this.clockLast) / 1000));
    this.clockLast = t;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number) {
    const holding = this.phase === "run" && (this.paused || this.countdown > 0);
    if (!holding) this.runTime += dt;
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
    if (this.mixer && !holding) {
      const athletic = (this.phase === "run" || this.phase === "replay") && !this.replayDone;
      const scale = athletic ? 0.9 + (this.speed / SPEED_MAX) * 0.65 : this.phase === "dead" || this.replayDone ? 1 : 0.75;
      this.mixer.timeScale = scale;
      this.mixer.update(dt);
      if (this.cat && this.phase !== "dead") {
        this.cat.rotation.y = runnerYaw(this.runnerId);
      }
    }

    const showRunner = this.phase !== "gallery";
    this.rig.visible = showRunner;
    this.shadow.visible = showRunner;

    this.scroll = 0;
    if (this.countdown > 0 && this.phase === "run") {
      this.countdown = Math.max(0, this.countdown - dt);
      const next = this.countdown > 0 ? Math.ceil(this.countdown) : 0;
      if (next !== this.countdownN) {
        this.countdownN = next;
        this.push(true);
      }
      if (this.countdown <= 0) {
        this.simAcc = 0;
        this.releaseGhostKeys();
        this.push(true);
      }
    } else if ((this.phase === "run" || this.phase === "replay") && !this.paused && !this.replayDone) {
      this.simAcc += dt;
      if (this.simAcc > 0.2) this.simAcc = 0.2;
      let steps = 0;
      while (this.simAcc >= SIM_STEP && steps < 8) {
        if (this.replaying) this.applyTape();
        this.simRun(SIM_STEP);
        this.simTick += 1;
        this.simAcc -= SIM_STEP;
        steps += 1;
        if ((this.phase !== "run" && this.phase !== "replay") || this.replayDone) break;
      }
    } else if (this.phase === "dead") this.simDead(dt);
    else if (this.phase === "gallery") this.simGallery(dt);
    else if (!this.paused) {
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

    this.readInput(dt);
    this.endZ += dz;
    this.ensureTrack();

    const target = laneX(this.lane);
    const maxStep = (LANE / 0.13) * dt;
    this.x += Math.max(-maxStep, Math.min(maxStep, target - this.x));

    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) {
        this.sliding = false;
        this.slideLatched = false;
      }
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
        this.jumpCut = JUMP_CUT_DELAY;
        this.jumpY = 0.01;
        this.jumps += 1;
        this.sfx.jump();
      }
    }
    if (!this.grounded) {
      const held =
        this.fullJump ||
        this.jumpHolds > 0 ||
        this.jumpPulse > 0 ||
        this.keys.has("Space") ||
        this.keys.has("ArrowUp") ||
        this.keys.has("KeyW");
      if (this.jumpCut > 0) this.jumpCut -= dt;
      else if (!held && this.vy > JUMP_CUT_V) this.vy = JUMP_CUT_V;
      this.vy -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.vy = 0;
        this.grounded = true;
        this.fullJump = false;
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
      this.pickedShield += 1;
      this.shield = true;
      this.flash = "SHIELD COLLECTED";
    } else if (tag === "magnet") {
      this.pickedMagnet += 1;
      this.magnetT = 8;
      this.flash = "MAGNET COLLECTED";
    } else if (tag === "surge") {
      this.pickedSurge += 1;
      this.surgeT = 8;
      this.flash = "SURGE COLLECTED";
    }
    this.flashT = 2.1;
    this.sfx.power();
    this.push(true);
  }

  private readInput(dt: number) {
    if (this.jumpPulse > 0) this.jumpPulse = Math.max(0, this.jumpPulse - dt);
    if (this.slidePulse > 0) this.slidePulse = Math.max(0, this.slidePulse - dt);
    const leftNow =
      this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.steerOverride > 0.35;
    const rightNow =
      this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.steerOverride < -0.35;
    if (leftNow && !this.wasLeft && !(rightNow && !this.wasRight)) this.requestLane(-1);
    if (rightNow && !this.wasRight && !(leftNow && !this.wasLeft)) this.requestLane(1);
    this.wasLeft = leftNow;
    this.wasRight = rightNow;

    const jumpNow =
      this.jumpHolds > 0 ||
      this.jumpPulse > 0 ||
      this.keys.has("Space") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("KeyW");
    if ((jumpNow && !this.wasJump) || this.queueJump) this.tryJump();
    this.wasJump = jumpNow;
    this.queueJump = false;

    const slideNow =
      this.slideHolds > 0 ||
      this.slidePulse > 0 ||
      this.keys.has("KeyS") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("ControlLeft");
    if ((slideNow && !this.wasSlide) || this.queueSlide) this.trySlide();
    if (this.sliding && !slideNow && !this.queueSlide && !this.slideLatched) {
      this.sliding = false;
      this.slideT = 0;
    }
    this.wasSlide = slideNow;
    this.queueSlide = false;
  }

  private moveAndCollide(dz: number) {
    const body = this.body();
    for (const ent of this.ents) {
      if (!ent.active) continue;
      ent.z += dz;
      if (ent.kind === "coin") this.tugCoin(ent, dz);
      const reach = ent.halfW + 0.34;
      const dx = Math.abs(this.x - (this.entX(ent) + ent.tug));
      const zHit = overlapZ(ent.z, ent.len, dz);
      if (ent.kind === "coin" || ent.kind === "power") {
        const magnet = ent.kind === "coin" && this.magnetT > 0 && this.coinInMagnet(ent);
        const high = ent.y > 1.4;
        const yOk = ent.kind === "power" || magnet || !high || this.jumpY > 0.75;
        const reachX = ent.kind === "power" ? 1.15 : 1.05;
        const reachZ = ent.kind === "power" ? 1.05 : 0.95;
        if (sweptNear(ent.z, dz, reachZ) && dx < reachX && yOk) {
          ent.active = false;
          ent.mesh.visible = false;
          if (ent.kind === "power") {
            this.grantPower(ent.tag);
          } else {
            this.coins += 1;
            this.combo += 1;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            this.comboT = 3.2;
            const mult = Math.min(5, 1 + Math.floor(this.combo / 4)) * (this.surgeT > 0 ? 2 : 1);
            this.points += 10 * mult;
            if (!this.flash.includes("COLLECTED")) {
              this.flash = mult > 1 ? `x${mult}` : "+APE";
              this.flashT = 0.35;
            }
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
          this.magnetT = 0;
          this.surgeT = 0;
          for (const coin of this.ents) {
            if (coin.kind === "coin") coin.tug = 0;
          }
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
    const settle = 1 - Math.exp(-6 * dt);
    this.pitch += (1.15 - this.pitch) * settle;
    this.pitchGroup.rotation.x = this.pitch;
    this.yawGroup.rotation.z = 0;
    this.yawGroup.rotation.y = this.yaw;
    this.rig.position.set(this.x, 0, Math.min(1.35, this.deathT * 2.2));
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
    if (this.shield) {
      const t = this.runTime;
      this.shieldRings.forEach((ring, i) => {
        const spin = t * (i === 1 ? -2.4 : 1.7 + i * 0.45);
        if (i === 1) ring.rotation.y = spin;
        else ring.rotation.z = spin;
        const mat = this.shieldMats[i];
        if (!mat) return;
        const hue = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.85 + i * 2.1));
        mat.color.setHSL(hue, 1, 0.52 + Math.sin(t * 3 + i) * 0.05);
        mat.opacity = 0.7 + Math.sin(t * 5 + i * 1.4) * 0.2;
      });
    }
    this.shadow.position.x = this.x;
    this.shadow.position.z = 0.05;
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.34 * (1 - Math.min(1, this.jumpY / 1.4));
  }

  private layoutEnts() {
    if (this.neonCyan && this.neonMag && this.neonGold) {
      const hue = (this.runTime * 0.07) % 1;
      this.neonCyan.color.setHSL(hue, 1, 0.55);
      this.neonMag.color.setHSL((hue + 0.33) % 1, 1, 0.52);
      this.neonGold.color.setHSL((hue + 0.66) % 1, 1, 0.55);
      const wave = 0.5 + 0.5 * Math.sin(this.runTime * 1.6);
      this.neonCyan.opacity = 0.62 + wave * 0.32;
      this.neonMag.opacity = 0.55 + wave * 0.28;
      this.neonGold.opacity = 0.58 + wave * 0.3;
    }
    for (const ent of this.ents) {
      if (!ent.active) continue;
      if (ent.kind === "power") {
        const bob = Math.sin(this.runTime * 4 + ent.z) * 0.1;
        const icon = ent.mesh.getObjectByName("power-icon");
        if (icon) icon.rotation.y = this.runTime * 1.6 + ent.spin0;
        ent.mesh.position.set(this.entX(ent), ent.y + bob, ent.z);
      } else if (ent.kind === "coin") {
        ent.mesh.rotation.y = this.runTime * Math.PI * 2 + ent.spin0;
        ent.mesh.position.set(
          this.entX(ent) + ent.tug,
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
        ent.tug = 0;
      }
    }
    this.updateMagnetChains();
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
    if (this.phase === "gallery") {
      this.camera.position.set(0, 1.7, 5.6);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.galleryPitch, this.galleryYaw, 0);
      return;
    }
    const target = this.x * 0.62;
    this.camX += (target - this.camX) * (1 - Math.exp(-4.5 * dt));
    const bob = Math.sin(this.runTime * (this.phase === "run" || this.phase === "replay" ? 11 : 2)) * (this.phase === "run" || this.phase === "replay" ? 0.045 : 0.02);
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
    if (this.surgeT > 0) bits.push("SURGE");
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
      track: this.sfx.trackName,
      flash: this.flash,
      buff: this.buffLabel(),
      newBest: this.newBest,
      loadError: this.loadError,
      runner: this.runnerName,
      runSerial: this.runSerial,
      seconds: Math.max(0, Math.floor(this.aliveFor)),
      shields: this.pickedShield,
      magnets: this.pickedMagnet,
      surges: this.pickedSurge,
      jumps: this.jumps,
      slides: this.slides,
      maxCombo: this.maxCombo,
      pace: this.galleryGear,
      paused: this.paused,
      countdown: this.countdownN,
      replayDone: this.replayDone,
      magnetLeft: this.magnetT > 0 ? Math.ceil(this.magnetT) : 0,
      surgeLeft: this.surgeT > 0 ? Math.ceil(this.surgeT) : 0,
    };
    const snap = JSON.stringify(hud);
    if (!force && snap === this.hudSnap) return;
    this.hudSnap = snap;
    this.onHud(hud);
  }

  private noteBest(score: number) {
    const next = Math.max(0, Math.floor(score) || 0);
    if (next <= this.best) return;
    this.best = next;
    this.bestAtStart = Math.max(this.bestAtStart, next);
    this.persist();
    this.push(true);
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
