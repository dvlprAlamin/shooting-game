import React, { useEffect, useState } from 'react';
import * as TWEEN from '@tweenjs/tween.js';
import { Canvas, useFrame } from '@react-three/fiber';
import { PointerLockControls, Sky } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { io } from 'socket.io-client';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
import RespawnPopup from './UI/RespawnPopup/RespawnPopup';
import { usePlayerStore } from './store/PlayersStore';
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
  // const [health, setHealth] = useState(100);
  // const [deathCount, setDeathCount] = useState(players[socket.id]?.deaths);
  // const { isDeath, setIsDeath } = useDeathStore();
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
      // if (newPlayer.id === socket.id) {
      //   setCurrentPlayer(newPlayer);
      // }

      // setPlayers((prevPlayers) => ({
      //   ...prevPlayers,
      //   [newPlayer.id]: {
      //     position: newPlayer.position,
      //     rotation: newPlayer.rotation,
      //     health: newPlayer.health,
      //     deaths: newPlayer.deaths,
      //     isDead: false,
      //   },
      // }));
    });

    // Handle player movement
    socket.on('playerMoved', (player) => {
      // if (player.id === socket.id) {
      //   setCurrentPlayer(player);
      // }
      // console.log('player.position', player.position);

      setPlayer(player);
      // setPlayers((prevPlayers) => ({
      //   ...prevPlayers,
      //   [player.id]: {
      //     position: player.position,
      //     rotation: player.rotation,
      //     health: player.health,
      //     deaths: player.deaths,
      //     // isDead: false,
      //   },
      // }));
    });

    // Handle player disconnection
    socket.on('playerDisconnected', (id) => {
      console.log('Player Disconnected:', id);
      removePlayer(id);
      // setPlayers((prevPlayers) => {
      //   const newPlayers = { ...prevPlayers };
      //   delete newPlayers[id];
      //   return newPlayers;
      // });
    });

    socket.on('hit', (player) => {
      console.log('Hit event received:', player);
      // setHealth(player.health);
      updatePlayer(socket.id, 'health', player.health);
    });

    socket.on('playerDead', (player) => {
      updatePlayer(player.id, 'isDead', true);
      // setPlayers((prevPlayers) => ({
      //   ...prevPlayers,
      //   [player.id]: {
      //     ...prevPlayers[player.id],
      //     isDead: true,
      //   },
      // }));

      if (player.shooter === socket.id) {
        console.log('You killed ', player.id);
      } else if (player.id === socket.id) {
        // setIsDeath(true);
        console.log(player.shooter, ' killed you');
      } else {
        console.log(player.shooter, ' killed ', player.id);
      }
    });

    // socket.on('respawn', (data) => {
    //   setHealth(data.health);
    //   setDeaths(data.deaths);
    //   setPlayers((prevPlayers) => ({
    //     ...prevPlayers,
    //     [socket.id]: {
    //       ...prevPlayers[socket.id],
    //       position: data.position,
    //       isDead: true,
    //     },
    //   }));
    // });

    socket.on('playerRespawned', (player) => {
      // if (player.id === socket.id) {
      //   setIsDeath(false);
      // }
      // setHealth(player.health);
      // setDeathCount(player.deaths);
      // setPlayers((prevPlayers) => ({
      //   ...prevPlayers,
      //   [socket.id]: player,
      // }));
      updatePlayer(player.id, 'isDead', false);
      setPlayer(player);
    });

    return () => {
      socket.off('currentPlayers');
      socket.off('newPlayer');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('hit');
      socket.off('playerDead');
      // socket.off('respawn');
      socket.off('playerRespawned');
    };
  }, []);

  const reSpawnHandler = () => {
    // console.log('spawn handler click', socket.id);

    socket.emit('respawn', socket.id);
  };
  return (
    <>
      {players[socket.id]?.isDead ? (
        <RespawnPopup reSpawnHandler={reSpawnHandler} />
      ) : (
        <></>
      )}
      <Canvas camera={{ fov: 45 }} shadows>
        <Scene players={players} isDead={players[socket.id]?.isDead} />
      </Canvas>
      <HUD
        health={players[socket.id]?.health}
        deaths={players[socket.id]?.deaths}
      />
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
          <Player
            key={id}
            id={id}
            // initialHealth={players[id].health}
            initialPosition={players[id].position}
            initialRotation={players[id].rotation}
            isDead={players[id].isDead}
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
    <div>Health: {health >= 0 ? health : 0}</div>
    <div>Respawn: {deaths || 0}</div>
  </div>
);
