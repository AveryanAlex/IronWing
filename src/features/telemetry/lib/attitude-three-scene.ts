import * as THREE from "three";

import { attitudeQuaternion } from "./attitude-orientation";
import {
  createVehicleModel,
  disposeObject3D,
  type AttitudeScenePalette,
  type VehicleModel,
} from "./attitude-models";

export type AttitudeRendererState = "loading" | "ready" | "unavailable" | "lost";

export type AttitudeSceneConfig = {
  pitchDeg: number | null | undefined;
  reducedMotion: boolean;
  rollDeg: number | null | undefined;
  vehicleType: string | null | undefined;
  yawDeg: number | null | undefined;
};

export type AttitudeSceneController = {
  dispose: () => void;
  resize: (width: number, height: number, devicePixelRatio: number) => void;
  update: (config: AttitudeSceneConfig) => void;
};

const DEFAULT_PALETTE: AttitudeScenePalette = {
  accent: "#12b9ff",
  border: "#263548",
  danger: "#ff4444",
  primary: "#e6edf3",
  secondary: "#6b8299",
  surface: "#202a36",
};

function readPalette(canvas: HTMLCanvasElement): AttitudeScenePalette {
  const styles = getComputedStyle(canvas);
  const color = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;
  return {
    accent: color("--color-accent", DEFAULT_PALETTE.accent),
    border: color("--color-border", DEFAULT_PALETTE.border),
    danger: color("--color-danger", DEFAULT_PALETTE.danger),
    primary: color("--color-text-primary", DEFAULT_PALETTE.primary),
    secondary: color("--color-text-muted", DEFAULT_PALETTE.secondary),
    surface: color("--color-bg-tertiary", DEFAULT_PALETTE.surface),
  };
}

function createReferencePlane(palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const grid = new THREE.GridHelper(7, 14, palette.border, palette.border);
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.opacity = 0.34;
    material.transparent = true;
  }
  root.add(grid);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.08, 3.12, 96),
    new THREE.MeshBasicMaterial({
      color: palette.secondary,
      opacity: 0.48,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.018;
  root.add(ring);

  const northLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.035, 0.72),
    new THREE.MeshBasicMaterial({ color: palette.accent }),
  );
  northLine.position.set(0, 0.045, -2.72);
  root.add(northLine);

  const northArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.38, 3),
    new THREE.MeshBasicMaterial({ color: palette.accent }),
  );
  northArrow.position.set(0, 0.06, -3.28);
  northArrow.rotation.x = -Math.PI / 2;
  root.add(northArrow);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 128;
  labelCanvas.height = 128;
  const labelContext = labelCanvas.getContext("2d");
  if (labelContext) {
    labelContext.fillStyle = palette.accent;
    labelContext.font = "700 76px sans-serif";
    labelContext.textAlign = "center";
    labelContext.textBaseline = "middle";
    labelContext.fillText("N", 64, 68);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
    label.position.set(0, 0.25, -3.52);
    label.scale.set(0.46, 0.46, 0.46);
    root.add(label);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 40),
    new THREE.MeshBasicMaterial({
      color: "#000000",
      opacity: 0.2,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);
  return root;
}

function vehicleTypeKey(vehicleType: string | null | undefined): string {
  return vehicleType?.trim().toLowerCase() || "unknown";
}

export function createAttitudeScene(
  canvas: HTMLCanvasElement,
  onStateChange: (state: AttitudeRendererState) => void,
): AttitudeSceneController {
  const palette = readPalette(canvas);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "low-power",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(4.6, 3.7, -6.4);
  camera.lookAt(0, 0.62, 0);

  const hemisphere = new THREE.HemisphereLight(palette.primary, palette.surface, 2.2);
  const keyLight = new THREE.DirectionalLight(palette.primary, 3.4);
  keyLight.position.set(-3.5, 6, -4.5);
  const rimLight = new THREE.DirectionalLight(palette.accent, 1.3);
  rimLight.position.set(5, 2, 5);
  scene.add(hemisphere, keyLight, rimLight);

  const referencePlane = createReferencePlane(palette);
  scene.add(referencePlane);

  let model: VehicleModel | null = null;
  let modelKey = "";
  let frame: number | null = null;
  let lastFrameTime = 0;
  let disposed = false;
  let contextLost = false;
  let hasAttitude = false;
  let reducedMotion = false;
  const currentQuaternion = new THREE.Quaternion();
  const targetQuaternion = new THREE.Quaternion();

  const render = () => {
    if (!disposed && !contextLost) {
      renderer.render(scene, camera);
    }
  };

  const cancelFrame = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };

  const applyQuaternion = () => {
    model?.root.quaternion.copy(currentQuaternion);
  };

  const animate = (time: number) => {
    frame = null;
    if (disposed || contextLost) return;

    const deltaSeconds = lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (time - lastFrameTime) / 1000));
    lastFrameTime = time;
    const remainingAngle = currentQuaternion.angleTo(targetQuaternion);

    if (remainingAngle <= 0.001 || reducedMotion) {
      currentQuaternion.copy(targetQuaternion);
      applyQuaternion();
      render();
      lastFrameTime = 0;
      return;
    }

    const alpha = 1 - Math.exp(-deltaSeconds / 0.045);
    currentQuaternion.slerp(targetQuaternion, alpha);
    applyQuaternion();
    render();
    frame = requestAnimationFrame(animate);
  };

  const scheduleRender = () => {
    if (frame === null && !disposed && !contextLost) {
      frame = requestAnimationFrame(animate);
    }
  };

  const replaceModel = (vehicleType: string | null | undefined) => {
    const nextKey = vehicleTypeKey(vehicleType);
    if (model && modelKey === nextKey) return;

    if (model) {
      scene.remove(model.root);
      disposeObject3D(model.root);
    }
    model = createVehicleModel(vehicleType, palette);
    model.root.quaternion.copy(currentQuaternion);
    modelKey = nextKey;
    scene.add(model.root);
  };

  const handleContextLost = () => {
    contextLost = true;
    cancelFrame();
    onStateChange("lost");
  };

  const handleContextRestored = () => {
    contextLost = false;
    onStateChange("ready");
    render();
    scheduleRender();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  onStateChange("ready");

  return {
    update(config) {
      reducedMotion = config.reducedMotion;
      replaceModel(config.vehicleType);

      const target = attitudeQuaternion(config.rollDeg, config.pitchDeg, config.yawDeg);
      targetQuaternion.set(target.x, target.y, target.z, target.w);
      if (!hasAttitude || reducedMotion) {
        currentQuaternion.copy(targetQuaternion);
        applyQuaternion();
        hasAttitude = true;
        render();
        return;
      }
      scheduleRender();
    },
    resize(width, height, devicePixelRatio) {
      if (disposed) return;
      const resolvedWidth = Math.max(1, Math.round(width));
      const resolvedHeight = Math.max(1, Math.round(height));
      const pixelRatio = Math.max(1, Math.min(2, devicePixelRatio || 1));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(resolvedWidth, resolvedHeight, false);
      camera.aspect = resolvedWidth / resolvedHeight;
      camera.updateProjectionMatrix();
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (model) {
        scene.remove(model.root);
        disposeObject3D(model.root);
        model = null;
      }
      disposeObject3D(referencePlane);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
