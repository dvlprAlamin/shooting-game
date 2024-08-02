import React, { useEffect, useState } from 'react';
import * as TWEEN from '@tweenjs/tween.js';
import { Canvas, useFrame } from '@react-three/fiber';
import { PointerLockControls, Sky } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { io } from 'socket.io-client';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
export const socket = io('http://localhost:3000');

const App = () => {
  const [players, setPlayers] = useState({});
  const [health, setHealth] = useState(100);
  const [deaths, setDeaths] = useState(0);

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
          health: newPlayer.health,
          deaths: newPlayer.deaths,
        },
      }));
    });

    // Handle player movement
    socket.on('playerMoved', (player) => {
      setPlayers((prevPlayers) => ({
        ...prevPlayers,
        [player.id]: {
          position: player.position,
          rotation: player.rotation,
          health: player.health,
          deaths: player.deaths,
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

    socket.on('hit', (data) => {
      console.log('Hit event received:', data);
      setHealth(data.health);
    });

    socket.on('playerDead', (data) => {
      if (data.shooter === socket.id) {
        console.log('You killed ', data.id);
      } else if (data.id === socket.id) {
        console.log(data.shooter, ' killed you');
      } else {
        console.log(data.shooter, ' killed ', data.id);
      }
    });

    socket.on('respawn', (data) => {
      setHealth(data.health);
      setDeaths(data.deaths);
    });

    return () => {
      socket.off('currentPlayers');
      socket.off('newPlayer');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('hit');
      socket.off('playerDead');
      socket.off('respawn');
    };
  }, []);

  return (
    <>
      <Canvas camera={{ fov: 45 }} shadows>
        <Scene players={players} />
      </Canvas>
      <HUD health={health} deaths={deaths} />
    </>
  );
};

export default App;

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
            // initialHealth={players[id].health}
            initialPosition={players[id].position}
            initialRotation={players[id].rotation}
          />
        ))}
      </Physics>
    </>
  );
};

const HUD = ({ health, deaths }) => (
  <div
    style={{
      position: 'absolute',
      top: 10,
      right: 10,
      color: 'white',
      background: 'rgba(0, 0, 0, 0.5)',
      padding: '5px',
      borderRadius: '5px',
      zIndex: 99,
    }}
  >
    <div>Health: {health}</div>
    <div>Deaths: {deaths}</div>
  </div>
);
