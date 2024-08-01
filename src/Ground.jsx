import { Gltf } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

export const Ground = () => {
  return (
    <RigidBody type="fixed" colliders="trimesh">
      <Gltf
        castShadow
        receiveShadow
        position={[0, -10, 0]}
        // rotation={[-Math.PI / 2, 0, 0]}
        scale={1.2}
        src="/hill.glb"
      />
    </RigidBody>
  );
};
