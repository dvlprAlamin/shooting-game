import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { rotate } from '@shooter/shared/maps/build';
import { LOW_QUALITY } from '@/config';
import { MATERIALS, textureFor } from './textures';

// Each face: its normal and the directions its texture's u and v run in (u × v = normal, so the corners
// below wind counter-clockwise seen from outside).
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const NO_ROTATION = [0, 0, 0, 1];
// Cheap stand-in for ambient occlusion: walls darken towards their foot, undersides are dark.
const FOOT_SHADE = 0.8;
const UNDERSIDE_SHADE = 0.65;

const axis = (v) => v.findIndex((x) => x !== 0);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// All boxes of one material as one geometry: one draw call per material for the whole map.
function boxGeometry(boxes, material) {
  const vertices = boxes.length * 24;
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const color = new Float32Array(vertices * 3);
  const index = [];
  const tint = new THREE.Color();
  let vi = 0;

  for (const box of boxes) {
    tint.set(box.tint ?? material.tint ?? '#ffffff');
    const q = box.q ?? NO_ROTATION;
    const half = box.s.map((v) => v / 2);
    for (const face of FACES) {
      const hn = half[axis(face.n)];
      const hu = half[axis(face.u)];
      const hv = half[axis(face.v)];
      const n = rotate(face.n, q);
      const shade = face.n[1] < 0 ? UNDERSIDE_SHADE : 1;
      index.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      for (const [su, sv] of CORNERS) {
        const local = [0, 1, 2].map((k) => face.n[k] * hn + face.u[k] * su * hu + face.v[k] * sv * hv);
        const p = rotate(local, q);
        position.set([box.c[0] + p[0], box.c[1] + p[1], box.c[2] + p[2]], vi * 3);
        normal.set(n, vi * 3);
        const um = material.uv === 'local' ? (su + 1) * hu : dot(box.c, face.u) + su * hu;
        const vm = material.uv === 'local' ? (sv + 1) * hv : dot(box.c, face.v) + sv * hv;
        uv.set([um / material.tile, vm / material.tile], vi * 2);
        const k = face.n[1] === 0 && sv < 0 ? FOOT_SHADE : shade;
        color.set([tint.r * k, tint.g * k, tint.b * k], vi * 3);
        vi++;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A map built from boxes (see @shooter/shared/maps): meshes grouped by material, and a cuboid collider per box. */
export const BlockMap = ({ map }) => {
  const gl = useThree((s) => s.gl);

  const meshes = useMemo(() => {
    const anisotropy = Math.min(LOW_QUALITY ? 4 : 8, gl.capabilities.getMaxAnisotropy());
    const byMaterial = new Map();
    for (const box of map.boxes) {
      if (!byMaterial.has(box.m)) byMaterial.set(box.m, []);
      byMaterial.get(box.m).push(box);
    }
    return [...byMaterial].map(([key, boxes]) => {
      const look = MATERIALS[key] ?? MATERIALS.concrete;
      const mesh = new THREE.Mesh(
        boxGeometry(boxes, look),
        new THREE.MeshStandardMaterial({
          map: textureFor(look.paint, anisotropy),
          vertexColors: true,
          roughness: look.roughness,
          metalness: 0,
        })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `map-${key}`;
      return mesh;
    });
  }, [map, gl]);

  // The textures are shared between maps and kept; geometries and materials belong to this map.
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
    [meshes]
  );

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {map.boxes.map((box, i) => (
          <CuboidCollider
            key={i}
            args={[box.s[0] / 2, box.s[1] / 2, box.s[2] / 2]}
            position={box.c}
            quaternion={box.q ?? NO_ROTATION}
          />
        ))}
      </RigidBody>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
};
