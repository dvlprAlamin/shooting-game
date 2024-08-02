import React, { useEffect, useState } from 'react';
import * as TWEEN from '@tweenjs/tween.js';
import { Canvas, useFrame } from '@react-three/fiber';
import { PointerLockControls, Sky } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { io } from 'socket.io-client';
export const socket = io('http://localhost:3000');

const App = () => {
  const [players, setPlayers] = useState({});

  useEffect(() => {
    // Handle current players
    socket.on('currentPlayers', (currentPlayers) => {
      console.log('Current Players:', currentPlayers);
      setPlayers(currentPlayers);
    });

    // Handle new player
    socket.on('newPlayer', (newPlayer) => {
      console.log('New Player:', newPlayer);
      setPlayers((prevPlayers) => ({
        ...prevPlayers,
        [newPlayer.id]: {
          position: newPlayer.position,
          rotation: newPlayer.rotation,
        },
      }));
    });

    // Handle player movement
    socket.on('playerMoved', (player) => {
      console.log('Player Moved:', player);
      setPlayers((prevPlayers) => ({
        ...prevPlayers,
        [player.id]: {
          position: player.position,
          rotation: player.rotation,
        },
      }));
    });

    // Handle player disconnection
    socket.on('playerDisconnected', (id) => {
      console.log('Player Disconnected:', id);
      setPlayers((prevPlayers) => {
        const newPlayers = { ...prevPlayers };
        delete newPlayers[id];
        return newPlayers;
      });
    });

    return () => {
      socket.off('currentPlayers');
      socket.off('newPlayer');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
    };
  }, []);

  return (
    <Canvas camera={{ fov: 45 }} shadows>
      <Scene players={players} />
    </Canvas>
  );
};

export default App;

const Scene = ({ players }) => {
  useFrame(() => {
    TWEEN.update();
  });
  return (
    <>
      <PointerLockControls />
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
