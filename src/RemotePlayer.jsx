import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

export const RemotePlayer = ({
  id,
  position = { x: 0, y: 0, z: 0 },
  isDead,
  health,
  playerName,
}) => {
  const playerRef = useRef();
  const bodyRef = useRef();

  useFrame((state, delta) => {
    if (!playerRef.current) return;

    const currentPos = playerRef.current.translation();
    const { x, y, z } = position;

    playerRef.current.setTranslation(
      { x, y: THREE.MathUtils.lerp(currentPos.y, position.y, 0.05), z },
      true
    );

    if (isDead) {
      bodyRef.current.rotateX(Math.PI * 0.5);
      bodyRef.current.position.set(0, -0.65, 0);
    }
  });

  return (
    <RigidBody
      // position={[position.x, position.y, position.z]}
      colliders={false}
      mass={1}
      ref={playerRef}
      lockRotations
    >
      <mesh ref={bodyRef} castShadow>
        <capsuleGeometry args={[0.4, 1]} />
        <meshBasicMaterial color={healthColor(health)} />
        <CapsuleCollider args={[0.5, 0.5]} />
      </mesh>
    </RigidBody>
  );
};

const healthColor = (health) => {
  if (health > 75) return 'green';
  if (health > 50) return 'yellow';
  if (health > 25) return 'orange';
  return 'red';
};
