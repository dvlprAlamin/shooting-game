import { Gltf, useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

// The map GLBs are Draco-compressed. Use the decoder in public/draco (copied from
// three/examples/jsm/libs/draco/gltf) instead of drei's default Google CDN, so the app works offline.
useGLTF.setDecoderPath('/draco/');

/** A map modelled in Blender: one GLB for collision (as a trimesh), one for looks only. */
export const GlbMap = ({ glb }) => (
  <>
    <RigidBody type="fixed" colliders="trimesh">
      <Gltf castShadow receiveShadow position={glb.position} scale={glb.scale} src={glb.physics} />
    </RigidBody>
    <Gltf castShadow receiveShadow position={glb.position} scale={glb.scale} src={glb.visual} />
  </>
);
