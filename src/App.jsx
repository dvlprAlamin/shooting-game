import React, { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { Group } from '@tweenjs/tween.js';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, PointerLockControls, Sky, Stats } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { io } from 'socket.io-client';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
import RespawnPopup from './UI/RespawnPopup/RespawnPopup';
import { usePlayerStore } from './store/PlayersStore';
import { RemotePlayer } from './RemotePlayer';
import RoomSelector from './UI/RoomSelector/RoomSelector';
import UI from './UI/UI';
import { useSnackbar } from 'notistack';
import InviteFriends from './UI/InviteFriend/InviteFriends';
import { Box } from '@mui/material';
export const socket = io(import.meta.env.VITE_SERVER_URL);
export const tweenGroup = new Group();
const App = () => {
  const {
    players,
    setPlayers,
    setCurrentPlayer,
    setPlayer,
    updatePlayer,
    removePlayer,
    leaderboard,
    setLeaderboard,
  } = usePlayerStore();
  const [isDead, setIsDead] = useState(false);
  const [isJoinedRoom, setIsJoinedRoom] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isServerConnected, setIsServerConnected] = useState(false);
  useEffect(() => {
    socket.on('connect', () => {
      setIsServerConnected(socket.connected);
    });
    socket.on('disconnect', () => {
      setIsServerConnected(socket.connected);
    });

    let timeOutId;
    // Handle current players
    socket.on('currentPlayers', (currentPlayers) => {
      console.log('Current Players:', currentPlayers);
      setPlayers(currentPlayers);
    });

    socket.on('leaderboardAllPlayers', (allPlayers) => {
      console.log('Current Players:', allPlayers);
      setLeaderboard(allPlayers);
    });

    // Handle new player
    socket.on('newPlayer', (newPlayer) => {
      console.log('New Player:', newPlayer);
      setPlayer({ ...newPlayer, isDead: false });
    });

    // Handle player movement
    socket.on('playerMoved', (player) => {
      updatePlayer(player.id, 'position', player.position);
      updatePlayer(player.id, 'rotation', player.rotation);
      // setPlayer(player);
    });

    socket.on('playerDead', (player) => {
      updatePlayer(player.id, 'isDead', true);

      if (player.shooter === socket.id) {
        enqueueSnackbar({
          message: `You killed ${player.playerName}!`,
          variant: 'success',
          hideIconVariant: true,
        });
      } else if (player.id === socket.id) {
        enqueueSnackbar({
          message: `${player.shooterName} killed you!`,
          variant: 'error',
          hideIconVariant: true,
        });
        setIsDead(true);
      } else {
        enqueueSnackbar({
          message: `${player.shooterName} killed ${player.playerName}!`,
          variant: 'info',
          hideIconVariant: true,
        });
      }
    });

    socket.on('playerKilled', (player) => {
      updatePlayer(player.id, 'kills', player.kills);
    });

    socket.on('playerRespawned', (player) => {
      removePlayer(player.id);
      timeOutId = setTimeout(() => {
        if (player.id === socket.id) {
          setIsDead(false);
        }
        setPlayer({ ...player, isDead: false });
      }, 1000);
    });

    socket.on('notification', ({ message }) => {
      enqueueSnackbar({
        message: message,
        variant: 'warning',
      });
    });

    socket.on('timerUpdate', (remaining) => {
      console.log('remaining', remaining);

      setTimeRemaining(remaining);
    });
    socket.on('gameOver', () => {
      setIsGameOver(true);
    });

    socket.on('joinedRoom', ({ message }) => {
      setIsJoinedRoom(true);
    });

    // Handle player disconnection
    socket.on('playerDisconnected', (id) => {
      removePlayer(id);
    });

    return () => {
      socket.off('currentPlayers');
      socket.off('leaderboardAllPlayers');
      socket.off('newPlayer');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('playerDead');
      socket.off('playerKilled');
      socket.off('playerRespawned');
      socket.off('notification');
      socket.off('timerUpdate');
      socket.off('gameOver');
      socket.off('joinedRoom');
      if (timeOutId) {
        clearTimeout(timeOutId);
      }
    };
  }, []);

  const reSpawnHandler = () => {
    socket.emit('respawn', socket.id);
  };

  const handleJoinRoom = (roomInfo) => {
    socket.emit('joinRoom', roomInfo);
  };

  if (!isServerConnected) {
    return (
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <h1>Connecting to the server...</h1>
      </Box>
    );
  }
  if (!isJoinedRoom) {
    return <RoomSelector joinRoom={handleJoinRoom} />;
  }

  return (
    <>
      {isDead || isGameOver ? (
        <RespawnPopup
          isGameOver={isGameOver}
          leaderboard={leaderboard}
          reSpawnHandler={reSpawnHandler}
        />
      ) : (
        <></>
      )}

      <HUD
        timeRemaining={timeRemaining}
        health={players[socket.id]?.health}
        deaths={players[socket.id]?.deaths}
        kills={players[socket.id]?.kills}
      />
      <InviteFriends />
      <UI />
      <Canvas camera={{ fov: 45 }} shadows>
        <Suspense
          fallback={
            <Html center>
              <h1 style={{ color: '#fff', marginTop: 40 }}>Loading...</h1>
            </Html>
          }
        >
          <Scene players={players} isDead={isDead} isGameOver={isGameOver} />
        </Suspense>
      </Canvas>
    </>
  );
};

export default App;

const Scene = ({ players, isDead, isGameOver }) => {
  useFrame(() => {
    tweenGroup.update();
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
      {!isDead && !isGameOver ? (
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
      <Physics gravity={[0, -9.8, 0]}>
        <Ground />
        {!isGameOver ? (
          Object.keys(players).map((id) => (
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
                  playerName={players[id].playerName}
                />
              )}
            </Fragment>
          ))
        ) : (
          <></>
        )}
      </Physics>
    </>
  );
};

const HUD = ({ health, deaths, kills, timeRemaining }) => {
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
      <div>Kills: {kills || 0}</div>
      <div>Respawn: {deaths || 0}</div>
      {timeRemaining ? (
        <div>
          Time: {Math.floor(timeRemaining / 60)}:
          {String(timeRemaining % 60).padStart(2, '0')}
        </div>
      ) : (
        <></>
      )}
    </div>
  );
};
