import * as THREE from "three";

import { createNumberSmoother } from "../../../lib/telemetry-smoothing";
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

const COMPASS_RADIUS = 3.12;
const MIN_CAMERA_ZOOM = 0.74;
const MAX_CAMERA_ZOOM = 1;

export function cameraZoomForViewport(width: number, height: number): number {
  const aspectRatio = Math.max(1, width) / Math.max(1, height);

  // A near-square viewport is constrained by the compass diameter. Wider
  // cards can use more of their height, but the cap preserves room for the
  // projected near edge and the degree labels.
  return THREE.MathUtils.clamp(0.74 + Math.max(0, aspectRatio - 1) * 0.21, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
}

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

function createCompassLabel(
  text: string,
  color: string,
  position: THREE.Vector3,
  scale = 0.34,
): THREE.Sprite {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 192;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create compass label");
  }

  context.fillStyle = color;
  context.font = "700 56px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  label.position.copy(position);
  label.scale.set(scale * 2, scale, 1);
  return label;
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
    new THREE.RingGeometry(COMPASS_RADIUS - 0.04, COMPASS_RADIUS, 96),
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

  const tickMaterial = new THREE.MeshBasicMaterial({
    color: palette.secondary,
    opacity: 0.7,
    transparent: true,
  });
  const majorTickMaterial = new THREE.MeshBasicMaterial({ color: palette.primary, opacity: 0.82, transparent: true });
  for (let degrees = 0; degrees < 360; degrees += 15) {
    const radians = degrees * Math.PI / 180;
    const isMajor = degrees % 45 === 0;
    const tickLength = isMajor ? 0.24 : 0.12;
    const radius = COMPASS_RADIUS - tickLength / 2;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(isMajor ? 0.045 : 0.028, 0.024, tickLength),
      isMajor ? majorTickMaterial : tickMaterial,
    );
    tick.position.set(Math.sin(radians) * radius, 0.045, -Math.cos(radians) * radius);
    tick.rotation.y = radians;
    root.add(tick);

    if (isMajor && degrees !== 0) {
      const labelRadius = COMPASS_RADIUS + 0.34;
      root.add(createCompassLabel(`${degrees}°`, palette.secondary, new THREE.Vector3(
        Math.sin(radians) * labelRadius,
        0.16,
        -Math.cos(radians) * labelRadius,
      ), 0.23));
    }
  }

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
  root.add(createCompassLabel("N", palette.accent, new THREE.Vector3(0, 0.2, -3.58), 0.34));

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

function createHeadingIndicator(palette: AttitudeScenePalette): THREE.ArrowHelper {
  const indicator = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.12, 0),
    COMPASS_RADIUS - 0.36,
    new THREE.Color(palette.accent),
    0.3,
    0.16,
  );
  return indicator;
}

function finiteYaw(yawDeg: number | null | undefined): yawDeg is number {
  return typeof yawDeg === "number" && Number.isFinite(yawDeg);
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
  // Looking north from the south keeps north at the top of the screen and
  // gives a level, north-facing vehicle an intuitive up-screen heading. The
  // below-plane target compensates for perspective so the projected compass,
  // rather than only its world origin, stays vertically centered.
  camera.position.set(0, 4.6, 7.2);
  camera.lookAt(0, -0.7, 0);

  const hemisphere = new THREE.HemisphereLight(palette.primary, palette.surface, 2.2);
  const keyLight = new THREE.DirectionalLight(palette.primary, 3.4);
  keyLight.position.set(-3.5, 6, -4.5);
  const rimLight = new THREE.DirectionalLight(palette.accent, 1.3);
  rimLight.position.set(5, 2, 5);
  scene.add(hemisphere, keyLight, rimLight);

  const referencePlane = createReferencePlane(palette);
  scene.add(referencePlane);
  const headingIndicator = createHeadingIndicator(palette);
  scene.add(headingIndicator);

  let model: VehicleModel | null = null;
  let modelKey = "";
  let frame: number | null = null;
  let disposed = false;
  let contextLost = false;
  let reducedMotion = false;
  let hasYaw = false;
  const attitudeSmoothers = {
    pitch: createNumberSmoother({ durationMs: 160, maxJump: 45 }),
    roll: createNumberSmoother({ durationMs: 160, circularRange: 360, maxJump: 90 }),
    yaw: createNumberSmoother({ durationMs: 300, circularRange: 360 }),
  };

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

  const renderAttitude = (timestampMs: number) => {
    const rollDeg = attitudeSmoothers.roll.valueAt(timestampMs);
    const pitchDeg = attitudeSmoothers.pitch.valueAt(timestampMs);
    const yawDeg = attitudeSmoothers.yaw.valueAt(timestampMs);
    const attitude = attitudeQuaternion(rollDeg, pitchDeg, yawDeg);
    model?.root.quaternion.set(attitude.x, attitude.y, attitude.z, attitude.w);

    headingIndicator.visible = hasYaw && yawDeg != null;
    if (hasYaw && yawDeg != null) {
      const yawRadians = yawDeg * Math.PI / 180;
      headingIndicator.setDirection(new THREE.Vector3(Math.sin(yawRadians), 0, -Math.cos(yawRadians)));
    }

    render();
  };

  const attitudeIsAnimating = (timestampMs: number) => {
    return Object.values(attitudeSmoothers).some((smoother) => smoother.isAnimating(timestampMs));
  };

  const animate = (time: number) => {
    frame = null;
    if (disposed || contextLost) return;

    renderAttitude(time);
    if (attitudeIsAnimating(time)) scheduleRender();
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
    renderAttitude(performance.now());
    scheduleRender();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  onStateChange("ready");

  return {
    update(config) {
      reducedMotion = config.reducedMotion;
      replaceModel(config.vehicleType);
      hasYaw = finiteYaw(config.yawDeg);

      const timestampMs = performance.now();
      const targetOptions = { instant: reducedMotion };
      attitudeSmoothers.pitch.setTarget(config.pitchDeg, timestampMs, targetOptions);
      attitudeSmoothers.roll.setTarget(config.rollDeg, timestampMs, targetOptions);
      attitudeSmoothers.yaw.setTarget(config.yawDeg, timestampMs, targetOptions);
      renderAttitude(timestampMs);

      if (reducedMotion) cancelFrame();
      else if (attitudeIsAnimating(timestampMs)) scheduleRender();
    },
    resize(width, height, devicePixelRatio) {
      if (disposed) return;
      const resolvedWidth = Math.max(1, Math.round(width));
      const resolvedHeight = Math.max(1, Math.round(height));
      const pixelRatio = Math.max(1, Math.min(2, devicePixelRatio || 1));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(resolvedWidth, resolvedHeight, false);
      camera.aspect = resolvedWidth / resolvedHeight;
      camera.zoom = cameraZoomForViewport(resolvedWidth, resolvedHeight);
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
      disposeObject3D(headingIndicator);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
