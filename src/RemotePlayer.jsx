import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

export const RemotePlayer = ({
  id,
  initialPosition = { x: 0, y: 0, z: 0 },
  initialRotation = { x: 0, y: 0, z: 0 },
  isDead,
}) => {
  const playerRef = useRef();

  useFrame((state) => {
    if (!playerRef.current) return;
    const { x, y, z } = initialPosition;
    playerRef.current.setTranslation({ x, y, z }, true);
    playerRef.current.setRotation(initialRotation, true);
  });

  return (
    <>
      <RigidBody
        position={[initialPosition.x, initialPosition.y, initialPosition.z]}
        colliders={false}
        mass={1}
        ref={playerRef}
        lockRotations
      >
        <mesh castShadow visible={!isDead}>
          <capsuleGeometry args={[0.4, 1]} />
          <meshBasicMaterial color={'yellow'} />
          <CapsuleCollider args={[0.5, 0.5]} />
        </mesh>
      </RigidBody>
    </>
  );
};
