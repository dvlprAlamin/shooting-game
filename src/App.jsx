// import * as TWEEN from '@tweenjs/tween.js';
// import { PointerLockControls, Sky } from '@react-three/drei';
// import { Ground } from '@/Ground.jsx';
// import { CapsuleCollider, Physics, RigidBody } from '@react-three/rapier';
// import { Player } from '@/Player.jsx';
// import { Canvas, useFrame } from '@react-three/fiber';
// import { usePointerLockControlsStore } from './store/PointerLockControlStore';
// import { usePlayerStore } from './store/PlayersStore';
// import { SocketManager } from './components/SocketManager';
// import { Fragment } from 'react';

// const shadowOffset = 50;

// export const App = () => {
//   const { players } = usePlayerStore();

//   console.log('players', players);
//   return (
//     <>
//       <SocketManager />
//       <Canvas camera={{ fov: 45 }} shadows>
//         <Scene />
//       </Canvas>
//     </>
//   );
// };

// export default App;

// const Scene = () => {
//   const { players, currentPlayer } = usePlayerStore();
//   console.log('players', players);

//   useFrame(() => {
//     TWEEN.update();
//   });

//   const pointerLockControlsLockHandler = () => {
//     usePointerLockControlsStore.setState({ isLock: true });
//   };

//   const pointerLockControlsUnlockHandler = () => {
//     usePointerLockControlsStore.setState({ isLock: false });
//   };
//   return (
//     <>
//       <PointerLockControls
//         onLock={pointerLockControlsLockHandler}
//         onUnlock={pointerLockControlsUnlockHandler}
//       />
//       <Sky sunPosition={[100, 20, 100]} />
//       <ambientLight intensity={1.5} />
//       <directionalLight
//         castShadow
//         intensity={1.5}
//         shadow-mapSize={4096}
//         shadow-camera-top={shadowOffset}
//         shadow-camera-bottom={-shadowOffset}
//         shadow-camera-left={shadowOffset}
//         shadow-camera-right={-shadowOffset}
//         position={[100, 100, 0]}
//       />
//       <Physics gravity={[0, -20, 0]}>
//         <Ground />
//         <Player />
//         {Object.keys(players)?.map((id) => (
//           <Fragment key={id}>
//             {currentPlayer.id !== id ? (
//               <RigidBody
//                 position={players[id].position}
//                 colliders={false}
//                 mass={1}
//                 lockRotations
//               >
//                 <mesh position={players[id].position} castShadow>
//                   <capsuleGeometry args={[0.5, 0.5]} />
//                   <meshBasicMaterial color={'yellow'} />
//                   <CapsuleCollider args={[0.75, 0.5]} />
//                 </mesh>
//               </RigidBody>
//             ) : (
//               <></>
//             )}
//           </Fragment>
//         ))}
//       </Physics>
//     </>
//   );
// };
import * as TWEEN from '@tweenjs/tween.js';
import { PointerLockControls, Sky } from '@react-three/drei';
import { Ground } from './Ground';
import { Physics } from '@react-three/rapier';
import { Player } from './Player';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';

const socket = io('http://localhost:4000');

export const App = () => {
  const [players, setPlayers] = useState({});
  console.log('players', players);

  useEffect(() => {
    socket.on('existingPlayers', (existingPlayers) => {
      setPlayers(existingPlayers);
    });

    socket.on('newPlayer', (newPlayer) => {
      setPlayers((prev) => ({ ...prev, [newPlayer.id]: newPlayer }));
    });

    socket.on('move', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const previousValue = { ...prev };
        delete previousValue[id];
        // const { [id]: _, ...rest } = prev;
        return previousValue;
      });
    });

    return () => {
      socket.off('existingPlayers');
      socket.off('newPlayer');
      socket.off('move');
      socket.off('playerDisconnected');
    };
  }, []);

  return (
    <>
      <Canvas camera={{ fov: 45 }} shadows>
        <Scene players={players} />
      </Canvas>
    </>
  );
};

const Scene = ({ players }) => {
  useFrame(() => {
    TWEEN.update();
  });

  const pointerLockControlsLockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: true });
  };

  const pointerLockControlsUnlockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: false });
  };

  return (
    <>
      <PointerLockControls
        onLock={pointerLockControlsLockHandler}
        onUnlock={pointerLockControlsUnlockHandler}
      />
      <Sky sunPosition={[100, 20, 100]} />
      <ambientLight intensity={1.5} />
      <directionalLight
        castShadow
        intensity={1.5}
        shadow-mapSize={4096}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-left={50}
        shadow-camera-right={-50}
        position={[100, 100, 0]}
      />
      <Physics gravity={[0, -20, 0]}>
        <Ground />
        {Object.keys(players).map((id) => (
          <Player
            key={id}
            id={id}
            initialPosition={players[id].position}
            initialRotation={players[id].rotation}
          />
        ))}
      </Physics>
    </>
  );
};

export default App;
