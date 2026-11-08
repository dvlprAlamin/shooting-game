import * as THREE from 'three';
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import bloodUrl from '@/assets/textures/blood_128x128.png';

const MAX_HOLES = 64;
const MAX_PUFFS = 8;
const HOLE_SIZE = 0.07;
const PUFF_LIFE = 90; // ms

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

function makeHoleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(10,10,10,1)');
  g.addColorStop(0.25, 'rgba(25,22,20,0.95)');
  g.addColorStop(0.5, 'rgba(60,55,50,0.45)');
  g.addColorStop(1, 'rgba(60,55,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSparkTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.3, 'rgba(255,170,60,0.8)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Bullet holes (one instanced draw call) and short-lived spark/blood puffs. */
export const Impacts = forwardRef(function Impacts(_, ref) {
  const bloodTexture = useLoader(THREE.TextureLoader, bloodUrl);

  const fx = useMemo(() => {
    const holes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE),
      new THREE.MeshBasicMaterial({
        map: makeHoleTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
      MAX_HOLES
    );
    holes.count = 0;
    holes.frustumCulled = false;

    const sparkMaterial = new THREE.SpriteMaterial({
      map: makeSparkTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const bloodMaterial = new THREE.SpriteMaterial({ map: bloodTexture, depthWrite: false, transparent: true });
    const puffs = Array.from({ length: MAX_PUFFS }, () => {
      const sprite = new THREE.Sprite(sparkMaterial);
      sprite.visible = false;
      sprite.userData.until = 0;
      return sprite;
    });
    const group = new THREE.Group();
    group.add(holes, ...puffs);
    return { group, holes, puffs, sparkMaterial, bloodMaterial, nextHole: 0, nextPuff: 0 };
  }, [bloodTexture]);

  useEffect(
    () => () => {
      fx.holes.geometry.dispose();
      fx.holes.material.map.dispose();
      fx.holes.material.dispose();
      fx.sparkMaterial.map.dispose();
      fx.sparkMaterial.dispose();
      fx.bloodMaterial.dispose();
    },
    [fx]
  );

  const puff = (point, material, size) => {
    const sprite = fx.puffs[fx.nextPuff];
    fx.nextPuff = (fx.nextPuff + 1) % MAX_PUFFS;
    sprite.material = material;
    sprite.position.copy(point);
    sprite.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    sprite.visible = true;
    sprite.userData.until = performance.now() + PUFF_LIFE;
  };

  useImperativeHandle(ref, () => ({
    bulletHole(point, normal) {
      _q.setFromUnitVectors(Z, normal);
      _q2.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
      _q.multiply(_q2);
      _p.copy(point).addScaledVector(normal, 0.004);
      _s.setScalar(0.8 + Math.random() * 0.5);
      fx.holes.setMatrixAt(fx.nextHole, _m.compose(_p, _q, _s));
      fx.holes.instanceMatrix.needsUpdate = true;
      fx.nextHole = (fx.nextHole + 1) % MAX_HOLES;
      fx.holes.count = Math.min(fx.holes.count + 1, MAX_HOLES);
      puff(_p.copy(point).addScaledVector(normal, 0.03), fx.sparkMaterial, 0.18);
    },
    blood(point) {
      puff(point, fx.bloodMaterial, 0.35);
    },
  }));

  useFrame(() => {
    const now = performance.now();
    for (const sprite of fx.puffs) {
      if (sprite.visible && now > sprite.userData.until) sprite.visible = false;
    }
  });

  return <primitive object={fx.group} />;
});
