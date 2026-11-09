import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, PointerLockControls, Sky, Stats } from '@react-three/drei';
import { Ground } from '@/Ground.jsx';
import { Physics } from '@react-three/rapier';
import { Player } from '@/Player.jsx';
import { socket } from '@/net/socket';
import {
  clearRemotes,
  dispatchShot,
  pushSnapshot,
  removeRemote,
  resetRemote,
} from '@/net/remotePlayers';
import { WORLD_FOV } from '@/game/constants';
import { IS_TOUCH, LOW_QUALITY } from '@/config';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
import RespawnPopup from './UI/RespawnPopup/RespawnPopup';
import { usePlayerStore } from './store/PlayersStore';
import { useHudStore } from './store/HudStore';
import { RemotePlayer } from './RemotePlayer';
import RoomSelector from './UI/RoomSelector/RoomSelector';
import UI from './UI/UI';
import { useSnackbar } from 'notistack';
import InviteFriends from './UI/InviteFriend/InviteFriends';
import TouchControls from './components/TouchControls';
import { Box } from '@mui/material';

export { socket };

const App = () => {
  const players = usePlayerStore((s) => s.players);
  const leaderboard = usePlayerStore((s) => s.leaderboard);
  const [isDead, setIsDead] = useState(false);
  const [isJoinedRoom, setIsJoinedRoom] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isServerConnected, setIsServerConnected] = useState(socket.connected);

  useEffect(() => {
    const { setPlayers, setPlayer, updatePlayer, removePlayer, setLeaderboard } = usePlayerStore.getState();
    const respawnTimeouts = new Set();

    const onConnect = () => setIsServerConnected(true);
    const onDisconnect = () => {
      setIsServerConnected(false);
      // The server forgets us on disconnect; go back to the room selector.
      setIsJoinedRoom(false);
      setIsDead(false);
      setIsGameOver(false);
      setPlayers({});
      clearRemotes();
    };

    // Handle current players
    const onCurrentPlayers = (currentPlayers) => {
      clearRemotes();
      for (const id in currentPlayers) {
        if (id !== socket.id) resetRemote(id, currentPlayers[id].position, currentPlayers[id].rotation?.y);
      }
      setPlayers(currentPlayers);
    };

    // Handle new player
    const onNewPlayer = (newPlayer) => {
      resetRemote(newPlayer.id, newPlayer.position);
      setPlayer({ ...newPlayer, isDead: false });
    };

    // Movement goes straight into the interpolation buffers, not into React state.
    const onPlayerMoved = (data) => pushSnapshot(data.id, data);
    const onPlayerShot = (data) => dispatchShot(data.id, data);

    const onPlayerDead = (player) => {
      updatePlayer(player.id, 'isDead', true);

      if (player.shooter === socket.id) {
        useHudStore.getState().showHitMarker(true);
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
    };

    const onPlayerKilled = (player) => updatePlayer(player.id, 'kills', player.kills);

    const onPlayerRespawned = (player) => {
      removePlayer(player.id);
      if (player.id !== socket.id) resetRemote(player.id, player.position);
      const timeoutId = setTimeout(() => {
        respawnTimeouts.delete(timeoutId);
        if (player.id === socket.id) {
          setIsDead(false);
        }
        setPlayer({ ...player, isDead: false });
      }, 1000);
      respawnTimeouts.add(timeoutId);
    };

    const onNotification = ({ message }) => {
      enqueueSnackbar({
        message: message,
        variant: 'warning',
      });
    };

    const onTimerUpdate = (remaining) => setTimeRemaining(remaining);
    const onGameOver = () => setIsGameOver(true);
    const onJoinedRoom = () => setIsJoinedRoom(true);

    // Handle player disconnection
    const onPlayerDisconnected = (id) => {
      removeRemote(id);
      removePlayer(id);
    };

    const handlers = {
      connect: onConnect,
      disconnect: onDisconnect,
      currentPlayers: onCurrentPlayers,
      leaderboardAllPlayers: setLeaderboard,
      newPlayer: onNewPlayer,
      playerMoved: onPlayerMoved,
      playerShot: onPlayerShot,
      playerDead: onPlayerDead,
      playerKilled: onPlayerKilled,
      playerRespawned: onPlayerRespawned,
      notification: onNotification,
      timerUpdate: onTimerUpdate,
      gameOver: onGameOver,
      joinedRoom: onJoinedRoom,
      playerDisconnected: onPlayerDisconnected,
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    setIsServerConnected(socket.connected);

    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      respawnTimeouts.forEach(clearTimeout);
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
      {IS_TOUCH && !isDead && !isGameOver && <TouchControls />}
      <Canvas
        camera={{ fov: WORLD_FOV, near: 0.05, far: 1000 }}
        dpr={LOW_QUALITY ? 1 : [1, 1.5]}
        shadows={!LOW_QUALITY}
      >
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
  const pointerLockControlsLockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: true });
  };

  const pointerLockControlsUnlockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: false });
  };

  return (
    <>
      <Stats />
      {/* Mouse look needs the Pointer Lock API, which phones don't have; touch look is in TouchControls. */}
      {!IS_TOUCH && !isDead && !isGameOver ? (
        <PointerLockControls
          makeDefault
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
        shadow-mapSize={2048}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-left={50}
        shadow-camera-right={-50}
        position={[100, 100, 0]}
      />
      {/* Step physics before any game logic so the player reads this frame's interpolated pose. */}
      <Physics gravity={[0, -9.8, 0]} updatePriority={-50}>
        <Ground />
        {!isGameOver ? (
          Object.keys(players).map((id) =>
            id === socket.id ? (
              <Player
                key={id}
                initialPosition={players[id].position}
                isDead={players[id].isDead}
              />
            ) : (
              <RemotePlayer
                key={id}
                id={id}
                initialPosition={players[id].position}
                isDead={players[id].isDead}
                playerName={players[id].playerName}
              />
            )
          )
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
        top: 'calc(var(--safe-top) + 10px)',
        right: 'calc(var(--safe-right) + 10px)',
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
