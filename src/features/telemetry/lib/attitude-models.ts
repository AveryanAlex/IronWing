import * as THREE from "three";

import {
  multirotorLayout,
  resolveAttitudeModelKind,
  type AttitudeModelKind,
} from "./attitude-orientation";

export type AttitudeScenePalette = {
  accent: string;
  border: string;
  danger: string;
  primary: string;
  secondary: string;
  surface: string;
};

export type VehicleModel = {
  kind: AttitudeModelKind;
  root: THREE.Group;
};

type Position = readonly [x: number, y: number, z: number];
type Rotation = readonly [x: number, y: number, z: number];

function standardMaterial(color: string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0.12,
    roughness: 0.62,
    ...options,
  });
}

function addBox(
  parent: THREE.Object3D,
  size: Position,
  position: Position,
  material: THREE.Material,
  rotation: Rotation = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  depth: number,
  position: Position,
  material: THREE.Material,
  rotation: Rotation = [0, 0, 0],
  segments = 24,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addBeam(
  parent: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function addNoseMarker(parent: THREE.Object3D, position: Position, material: THREE.Material, radius = 0.25) {
  const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 1.8, 6), material);
  nose.position.set(...position);
  nose.rotation.x = -Math.PI / 2;
  parent.add(nose);
}

function createFixedWingModel(palette: AttitudeScenePalette, withRotors = false): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary);
  const wing = standardMaterial(palette.accent, { metalness: 0.18 });
  const underside = standardMaterial(palette.secondary);
  const rotor = new THREE.MeshBasicMaterial({
    color: palette.primary,
    opacity: 0.38,
    side: THREE.DoubleSide,
    transparent: true,
  });

  addBox(root, [0.48, 0.3, 2.35], [0, 0.18, 0], body);
  addNoseMarker(root, [0, 0.18, -1.42], wing, 0.32);
  addBox(root, [3.25, 0.12, 0.72], [0, 0.14, -0.18], wing);
  addBox(root, [1.25, 0.1, 0.4], [0, 0.17, 0.94], underside);
  addBox(root, [0.12, 0.58, 0.46], [0, 0.45, 0.93], wing, [-0.18, 0, 0]);
  addBox(root, [0.34, 0.12, 0.34], [0, 0.36, -0.72], underside);

  if (withRotors) {
    for (const [x, z] of [[-1.15, -0.28], [1.15, -0.28], [-1.15, 0.32], [1.15, 0.32]] as const) {
      addBox(root, [0.18, 0.26, 0.34], [x, 0.28, z], body);
      addCylinder(root, 0.34, 0.035, [x, 0.48, z], rotor);
    }
  }

  return root;
}

function rotorPositions(vehicleType: string | null | undefined): Position[] {
  const layout = multirotorLayout(vehicleType);
  if (layout === "coaxial") {
    return [
      [-0.95, 0.18, 0],
      [-0.95, 0.34, 0],
      [0.95, 0.18, 0],
      [0.95, 0.34, 0],
    ];
  }

  const count = layout === "tri" ? 3 : layout === "hex" ? 6 : layout === "octo" ? 8 : 4;
  const phase = count === 4 ? Math.PI / 4 : -Math.PI / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = phase + index * Math.PI * 2 / count;
    return [Math.cos(angle) * 1.08, 0.24, Math.sin(angle) * 1.08] as const;
  });
}

function createMultirotorModel(vehicleType: string | null | undefined, palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary);
  const accent = standardMaterial(palette.accent);
  const arm = standardMaterial(palette.secondary);
  const rotor = new THREE.MeshBasicMaterial({
    color: palette.primary,
    opacity: 0.4,
    side: THREE.DoubleSide,
    transparent: true,
  });

  addBox(root, [0.68, 0.28, 0.8], [0, 0.2, 0], body);
  addNoseMarker(root, [0, 0.22, -0.62], accent, 0.22);

  for (const [x, y, z] of rotorPositions(vehicleType)) {
    addBeam(root, new THREE.Vector3(0, 0.21, 0), new THREE.Vector3(x, y, z), 0.055, arm);
    addCylinder(root, 0.34, 0.032, [x, y + 0.08, z], rotor, [0, 0, 0], 28);
    addCylinder(root, 0.075, 0.14, [x, y, z], accent, [0, 0, 0], 14);
  }

  return root;
}

function createHelicopterModel(palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary);
  const accent = standardMaterial(palette.accent);
  const secondary = standardMaterial(palette.secondary);
  const rotor = new THREE.MeshBasicMaterial({
    color: palette.primary,
    opacity: 0.42,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), body);
  cabin.scale.set(0.8, 0.65, 1.25);
  cabin.position.set(0, 0.28, -0.35);
  root.add(cabin);
  addNoseMarker(root, [0, 0.28, -1.04], accent, 0.25);
  addBeam(root, new THREE.Vector3(0, 0.32, 0.05), new THREE.Vector3(0, 0.43, 1.75), 0.085, secondary);
  addCylinder(root, 1.45, 0.035, [0, 0.92, -0.08], rotor);
  addCylinder(root, 0.34, 0.028, [0.08, 0.48, 1.72], rotor, [0, 0, Math.PI / 2]);
  addBox(root, [0.08, 0.52, 0.42], [0, 0.64, 1.58], accent, [-0.16, 0, 0]);
  addBox(root, [1.15, 0.04, 0.08], [0, -0.2, -0.12], secondary);
  return root;
}

function createRoverModel(palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary);
  const accent = standardMaterial(palette.accent);
  const wheel = standardMaterial(palette.secondary, { roughness: 0.9 });

  addBox(root, [1.55, 0.34, 2.15], [0, 0.32, 0], body);
  addBox(root, [1.12, 0.48, 1], [0, 0.7, 0.22], accent);
  addNoseMarker(root, [0, 0.5, -1.3], accent, 0.25);
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.68, 0.68]) {
      addCylinder(root, 0.34, 0.22, [x, 0.17, z], wheel, [0, 0, Math.PI / 2], 18);
    }
  }
  return root;
}

function createSubmarineModel(palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary, { metalness: 0.22 });
  const accent = standardMaterial(palette.accent);
  const secondary = standardMaterial(palette.secondary);

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.65, 8, 18), body);
  hull.rotation.x = Math.PI / 2;
  hull.position.y = 0.25;
  root.add(hull);
  addNoseMarker(root, [0, 0.25, -1.38], accent, 0.28);
  addBox(root, [0.16, 0.52, 0.56], [0, 0.72, 0.22], accent);
  addBox(root, [1.65, 0.09, 0.48], [0, 0.2, 0.48], secondary);
  addBox(root, [0.09, 0.82, 0.52], [0, 0.3, 0.72], secondary);
  return root;
}

function createGenericModel(palette: AttitudeScenePalette): THREE.Group {
  const root = new THREE.Group();
  const body = standardMaterial(palette.primary);
  const accent = standardMaterial(palette.accent);
  addBox(root, [0.58, 0.3, 1.75], [0, 0.22, 0], body);
  addBox(root, [1.75, 0.1, 0.45], [0, 0.18, 0.15], body);
  addNoseMarker(root, [0, 0.22, -1.12], accent, 0.3);
  return root;
}

export function createVehicleModel(
  vehicleType: string | null | undefined,
  palette: AttitudeScenePalette,
): VehicleModel {
  const kind = resolveAttitudeModelKind(vehicleType);
  const root = kind === "fixed_wing"
    ? createFixedWingModel(palette)
    : kind === "vtol"
      ? createFixedWingModel(palette, true)
      : kind === "multirotor"
        ? createMultirotorModel(vehicleType, palette)
        : kind === "helicopter"
          ? createHelicopterModel(palette)
          : kind === "rover"
            ? createRoverModel(palette)
            : kind === "submarine"
              ? createSubmarineModel(palette)
              : createGenericModel(palette);

  root.name = `attitude-model-${kind}`;
  root.position.y = 0.65;
  return { kind, root };
}

export function disposeObject3D(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedTextures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh)
      && !(object instanceof THREE.Line)
      && !(object instanceof THREE.Points)
      && !(object instanceof THREE.Sprite)
    ) {
      return;
    }

    if ("geometry" in object && object.geometry && !disposedGeometries.has(object.geometry)) {
      disposedGeometries.add(object.geometry);
      object.geometry.dispose();
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!disposedMaterials.has(material)) {
        disposedMaterials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
            disposedTextures.add(value);
            value.dispose();
          }
        }
        material.dispose();
      }
    }
  });
}
