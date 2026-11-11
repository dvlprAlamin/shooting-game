import { Sky } from '@react-three/drei';
import { BlockMap } from './BlockMap';
import { GlbMap } from './GlbMap';

/** The map and its lighting. Goes inside <Physics>: the map's colliders need it. */
export const World = ({ map }) => {
  const { light } = map;
  // The shadow camera covers the whole map, seen from any angle; block maps are smaller than the canyon.
  const extent = map.bounds ? Math.ceil(map.bounds * 1.45) : 50;
  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <ambientLight intensity={light.ambient} />
      {light.hemisphere && (
        <hemisphereLight args={[light.hemisphere.sky, light.hemisphere.ground, light.hemisphere.intensity]} />
      )}
      <directionalLight
        castShadow
        intensity={light.sunIntensity}
        shadow-mapSize={2048}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-left={extent}
        shadow-camera-right={-extent}
        // Without a bias, big flat floors get shadow acne (moiré rings); the canyon's meshes never needed one.
        shadow-bias={map.glb ? 0 : -0.0005}
        shadow-normalBias={map.glb ? 0 : 0.04}
        position={light.sun}
      />
      {map.glb ? <GlbMap glb={map.glb} /> : <BlockMap map={map} />}
    </>
  );
};
