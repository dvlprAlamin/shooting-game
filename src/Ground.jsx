import { Gltf, useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

// The map GLBs are Draco-compressed. Use the decoder in public/draco (copied from
// three/examples/jsm/libs/draco/gltf) instead of drei's default Google CDN, so the app works offline.
useGLTF.setDecoderPath('/draco/');

export const Ground = () => {
  return (
    <>
      <RigidBody type="fixed" colliders="trimesh">
        <Gltf
          castShadow
          receiveShadow
          position={[0, -10, 0]}
          scale={1.2}
          src="/physics-scene.glb"
        />
      </RigidBody>
      <Gltf
        castShadow
        receiveShadow
        position={[0, -10, 0]}
        scale={1.2}
        src="/physicsless-scene.glb"
      />
    </>
  );
};
