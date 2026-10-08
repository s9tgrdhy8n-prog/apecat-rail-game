import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { StageBundle } from "@/game/types";

type Pose = "run" | "dance" | "still";

const _poseBox = new THREE.Box3();

function posedBounds(model: THREE.Object3D, mixer: THREE.AnimationMixer, clip: THREE.AnimationClip | null) {
  const box = new THREE.Box3();
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }
  const marks = [0.02, 0.35, 0.68];
  for (const mark of marks) {
    mixer.setTime(clip ? Math.max(0.02, clip.duration * mark) : 0.02);
    model.updateMatrixWorld(true);
    model.traverse((obj) => {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) {
        skinned.skeleton.update();
        skinned.computeBoundingBox();
        if (!skinned.boundingBox || skinned.boundingBox.isEmpty()) return;
        _poseBox.copy(skinned.boundingBox).applyMatrix4(skinned.matrixWorld);
        box.union(_poseBox);
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      _poseBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      box.union(_poseBox);
    });
  }
  mixer.stopAllAction();
  model.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.pose();
  });
  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      if (!skinned.boundingBox || skinned.boundingBox.isEmpty()) return;
      _poseBox.copy(skinned.boundingBox).applyMatrix4(skinned.matrixWorld);
      box.union(_poseBox);
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.45, -0.8, -0.45), new THREE.Vector3(0.45, 0.8, 0.45));
  return box;
}

function portraitColor(src: string) {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = 24;
      const h = 32;
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) {
        resolve("#16324a");
        return;
      }
      g.drawImage(img, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data;
      const spots = [
        [1, 1],
        [w - 2, 1],
        [1, h - 2],
        [w - 2, h - 2],
        [w / 2, 1],
        [1, h / 2],
        [w - 2, h / 2],
        [w / 2, h - 2],
      ];
      let r = 0;
      let gc = 0;
      let b = 0;
      for (const [x, y] of spots) {
        const i = (Math.floor(y) * w + Math.floor(x)) * 4;
        r += data[i] ?? 0;
        gc += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
      }
      const n = spots.length;
      resolve(`rgb(${Math.round(r / n)}, ${Math.round(gc / n)}, ${Math.round(b / n)})`);
    };
    img.onerror = () => resolve("#16324a");
    img.src = src;
  });
}

export function RunnerStage({
  label,
  handle,
  portrait,
  bundle,
  onClose,
}: {
  label: string;
  handle: string;
  portrait: string;
  bundle: StageBundle;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const turnRef = useRef<THREE.Group | null>(null);
  const applyPose = useRef<(next: Pose) => void>(() => undefined);
  const bgRef = useRef("#16324a");
  const [pose, setPose] = useState<Pose>("still");
  const [bg, setBg] = useState("#16324a");
  const drag = useRef<{ x: number } | null>(null);

  useEffect(() => {
    let cancel = false;
    void portraitColor(portrait).then((color) => {
      if (cancel) return;
      bgRef.current = color;
      setBg(color);
    });
    return () => {
      cancel = true;
    };
  }, [portrait]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { model, run, dance } = bundle;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(bgRef.current);
    scene.background = bgColor;
    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x2a2438, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.2, 4.5, 3.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7e6ff, 0.55);
    rim.position.set(-2.4, 2.2, -2.6);
    scene.add(rim);

    const turn = new THREE.Group();
    turn.rotation.y = Math.PI;
    turn.add(model);
    scene.add(turn);
    turnRef.current = turn;

    const mixer = new THREE.AnimationMixer(model);
    const box = posedBounds(model, mixer, run);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const localCenter = turn.worldToLocal(center.clone());
    model.position.x -= localCenter.x;
    model.position.y -= localCenter.y;
    model.position.z -= localCenter.z;
    model.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 80);
    const placeCamera = () => {
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const distH = Math.max(size.y, 0.2) / 2 / Math.tan(vFov / 2);
      const distW = Math.max(size.x, 0.2) / 2 / Math.tan(hFov / 2);
      const dist = Math.max(distH, distW) * 1.42 + size.z * 0.5;
      camera.position.set(0, 0, dist);
      camera.near = Math.max(0.02, dist * 0.05);
      camera.far = dist + Math.max(size.z, size.y) * 6 + 8;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    placeCamera();
    let current: THREE.AnimationAction | null = null;
    let still = false;

    const playClip = (clip: THREE.AnimationClip | null) => {
      still = false;
      if (!clip) return;
      const next = mixer.clipAction(clip);
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      if (current && current !== next) current.fadeOut(0.18);
      next.reset().fadeIn(0.18).play();
      current = next;
    };

    const showStill = () => {
      still = true;
      mixer.stopAllAction();
      current = null;
      model.traverse((obj) => {
        const skinned = obj as THREE.SkinnedMesh;
        if (skinned.isSkinnedMesh) skinned.skeleton.pose();
      });
    };

    applyPose.current = (next) => {
      if (next === "still") showStill();
      else if (next === "dance") playClip(dance ?? run);
      else playClip(run);
    };
    applyPose.current("still");

    let frame = 0;
    let last = performance.now();
    let painted = bgRef.current;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still) mixer.update(dt);
      if (bgRef.current !== painted) {
        painted = bgRef.current;
        bgColor.set(painted);
      }
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const bufW = Math.round(w * renderer.getPixelRatio());
      const bufH = Math.round(h * renderer.getPixelRatio());
      if (renderer.domElement.width !== bufW || renderer.domElement.height !== bufH) {
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        placeCamera();
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      mixer.stopAllAction();
      turnRef.current = null;
      scene.remove(turn);
      renderer.dispose();
      applyPose.current = () => undefined;
    };
  }, [bundle]);

  useEffect(() => {
    applyPose.current(pose);
  }, [pose]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    drag.current = { x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    const turn = turnRef.current;
    if (!active || !turn) return;
    const dx = e.clientX - active.x;
    active.x = e.clientX;
    turn.rotation.y += dx * 0.012;
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      className="rail-sheet rail-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="rail-stage-box" style={{ background: bg }}>
        <canvas ref={canvasRef} />
        <button type="button" className="rail-stage-close" onClick={onClose}>
          Close
        </button>
        <div className="rail-stage-head">
          <p className="rail-stage-name">{label}</p>
          {handle ? (
            <a className="rail-stage-x" href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer">
              @{handle}
            </a>
          ) : null}
        </div>
        <div className="rail-stage-acts" role="group" aria-label="Animations">
          <button type="button" className={pose === "run" ? "is-on" : ""} aria-pressed={pose === "run"} onClick={() => setPose("run")}>
            Run
          </button>
          <button
            type="button"
            className={pose === "dance" ? "is-on" : ""}
            aria-pressed={pose === "dance"}
            disabled={!bundle.dance}
            onClick={() => setPose("dance")}
          >
            Dance
          </button>
          <button type="button" className={pose === "still" ? "is-on" : ""} aria-pressed={pose === "still"} onClick={() => setPose("still")}>
            Still
          </button>
        </div>
      </div>
    </div>
  );
}
