import * as THREE from "three";

const LOOK = 10;

/** Chrome silver body, matching Gimbo's profile photo. */
export function applyGimboLook(root: THREE.Object3D) {
  root.getObjectByName("GimboTorchTip")?.removeFromParent();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      if (std.userData.gimboLook === LOOK) continue;
      std.metalness = 1;
      std.roughness = 1;
      std.envMapIntensity = 1.7;
      std.color.set(0xb4bbc2);
      std.userData.gimboLook = LOOK;
      std.needsUpdate = true;
    }
  });
}
