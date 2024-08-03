import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { socket } from './App';

export const RemotePlayer = ({
  id,
  position = { x: 0, y: 0, z: 0 },
  isDead,
  health,
}) => {
  const playerRef = useRef();
  const bodyRef = useRef();
  //   const [color, setColor] = useState('yellow');
  //   useEffect(() => {
  //     socket.on('hit', (player) => {
  //       console.log('player', player);

  //       if (player.health > 70) {
  //         setColor('yellow');
  //       } else if (player.health >= 30 && player.health < 70) {
  //         setColor('orange');
  //       } else {
  //         setColor('red');
  //       }
  //     });

  //     return () => {
  //       socket.off('hit');
  //     };
  //   }, []);

  useFrame((state) => {
    if (!playerRef.current) return;
    const { x, y, z } = position;
    playerRef.current.setTranslation({ x, y, z }, true);

    if (isDead) {
      bodyRef.current.rotateX(Math.PI * 0.5);
      bodyRef.current.position.set(0, -0.65, 0);
    }
  });

  return (
    <>
      <RigidBody
        position={[position.x, position.y, position.z]}
        colliders={false}
        mass={1}
        ref={playerRef}
        lockRotations
      >
        <mesh ref={bodyRef} castShadow>
          <capsuleGeometry args={[0.4, 1]} />
          <meshBasicMaterial
            color={
              //   health >= 70 ?
              'yellow'
              // : health >= 30 && health < 70
              // ? 'orange'
              // : 'red'
            }
          />
          <CapsuleCollider args={[0.5, 0.5]} />
        </mesh>
      </RigidBody>
    </>
  );
};
