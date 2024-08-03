import React, { Fragment, useEffect, useState } from 'react';
import * as TWEEN from '@tweenjs/tween.js';
import { Canvas, useFrame } from '@react-three/fiber';
import { PointerLockControls, Sky, Stats } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { io } from 'socket.io-client';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
import RespawnPopup from './UI/RespawnPopup/RespawnPopup';
import { usePlayerStore } from './store/PlayersStore';
import Player2 from './Player2';
import { RemotePlayer } from './RemotePlayer';
export const socket = io('http://localhost:3000');

const App = () => {
  const {
    players,
    setPlayers,
    setCurrentPlayer,
    setPlayer,
    updatePlayer,
    removePlayer,
  } = usePlayerStore();
  const [isDied, setIsDied] = useState(false);
  useEffect(() => {
    // Handle current players
    socket.on('currentPlayers', (currentPlayers) => {
      console.log('Current Players:', currentPlayers);
      setPlayers(currentPlayers);
    });

    // Handle new player
    socket.on('newPlayer', (newPlayer) => {
      console.log('New Player:', newPlayer);
      setPlayer({ ...newPlayer, isDead: false });
    });

    // Handle player movement
    socket.on('playerMoved', (player) => {
      setPlayer(player);
    });

    socket.on('hit', (player) => {
      updatePlayer(socket.id, 'health', player.health);
    });

    socket.on('playerDead', (player) => {
      // updatePlayer(player.id, 'isDead', true);
      removePlayer(player.id);
      if (player.shooter === socket.id) {
        console.log('You killed ', player.id);
      } else if (player.id === socket.id) {
        console.log(player.shooter, ' killed you');
        setIsDied(true);
      } else {
        console.log(player.shooter, ' killed ', player.id);
      }
    });

    socket.on('playerRespawned', (player) => {
      // removePlayer(player.id);
      if (player.id === socket.id) {
        setIsDied(false);
      }
      setPlayer(player);
    });

    // Handle player disconnection
    socket.on('playerDisconnected', (id) => {
      removePlayer(id);
    });

    return () => {
      socket.off('currentPlayers');
      socket.off('newPlayer');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('hit');
      socket.off('playerDead');
      socket.off('playerRespawned');
    };
  }, []);

  const reSpawnHandler = () => {
    socket.emit('respawn', socket.id);
  };

  return (
    <>
      {isDied ? (
        // players[socket.id]?.isDead
        <RespawnPopup reSpawnHandler={reSpawnHandler} />
      ) : (
        <HUD
          health={players[socket.id]?.health}
          deaths={players[socket.id]?.deaths}
        />
      )}
      <Canvas camera={{ fov: 45 }} shadows>
        <Scene players={players} isDead={players[socket.id]?.isDead} />
      </Canvas>
    </>
  );
};

export default App;

const Scene = ({ players, isDead }) => {
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
      <Stats />
      {!isDead ? (
        <PointerLockControls
          onLock={pointerLockControlsLockHandler}
          onUnlock={pointerLockControlsUnlockHandler}
        />
      ) : (
        <></>
      )}
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
          <Fragment key={id}>
            {id === socket.id ? (
              <Player
                key={id}
                id={id}
                initialPosition={players[id].position}
                initialRotation={players[id].rotation}
                isDead={players[id].isDead}
                health={players[id].health}
              />
            ) : (
              <RemotePlayer
                key={id}
                id={id}
                position={players[id].position}
                isDead={players[id].isDead}
                health={players[id].health}
              />
            )}
          </Fragment>
        ))}
      </Physics>
    </>
  );
};

const HUD = ({ health, deaths }) => {
  return (
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
      <div>Health: {health >= 0 ? health : 0}</div>
      <div>Respawn: {deaths || 0}</div>
    </div>
  );
};
