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
  setProtection,
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
import Hud from './UI/Hud/Hud';
import { Loading, Reconnecting } from './UI/Status/Status';
import { useFeedStore } from './store/FeedStore';
import TouchControls from './components/TouchControls';

export { socket };

// Streaks worth announcing: 3, 5 and 7 kills in a row, then every 5 from 10.
const STREAK_MIN = 3;
const isStreakMilestone = (n) => n === 3 || n === 5 || n === 7 || (n >= 10 && n % 5 === 0);

const NO_REMATCH = { votes: [], startsIn: null };

const App = () => {
  const players = usePlayerStore((s) => s.players);
  const leaderboard = usePlayerStore((s) => s.leaderboard);
  const [isDead, setIsDead] = useState(false);
  const [isJoinedRoom, setIsJoinedRoom] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [killedBy, setKilledBy] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [rematch, setRematch] = useState(NO_REMATCH);

  useEffect(() => {
    const { setPlayers, setPlayer, updatePlayer, removePlayer, setLeaderboard } = usePlayerStore.getState();
    const { pushKill, pushNotice } = useFeedStore.getState();
    const hud = useHudStore.getState();
    const respawnTimeouts = new Set();

    // Spawn protection: the server says how many ms are left, and it's timed on this clock from now.
    const protect = (player) => {
      if (player.id === socket.id) hud.setProtection(player.protection);
      else setProtection(player.id, player.protection);
    };

    // The connection opens when joining a room. 'disconnect' means joining failed or the connection
    // is gone for good (reconnecting gave up): go back to the room selector.
    const onReconnecting = () => setIsReconnecting(true);
    const onDisconnect = () => {
      setIsReconnecting(false);
      setIsJoinedRoom(false);
      setIsDead(false);
      setIsGameOver(false);
      setRematch(NO_REMATCH);
      setPlayers({});
      clearRemotes();
      hud.setProtection(0);
    };

    // Handle current players
    const onCurrentPlayers = (currentPlayers) => {
      clearRemotes();
      for (const id in currentPlayers) {
        if (id !== socket.id) resetRemote(id, currentPlayers[id].position, currentPlayers[id].rotation?.y);
        protect(currentPlayers[id]);
      }
      setPlayers(currentPlayers);
    };

    // Handle new player
    const onNewPlayer = (newPlayer) => {
      resetRemote(newPlayer.id, newPlayer.position);
      protect(newPlayer);
      setPlayer({ ...newPlayer, isDead: false });
    };

    // Movement goes straight into the interpolation buffers, not into React state.
    const onPlayerMoved = (data) => pushSnapshot(data.id, data);
    const onPlayerShot = (data) => dispatchShot(data.id, data);

    // `streak` is the shooter's, counting this kill; `endedStreak` is the one the victim had going.
    const onPlayerDead = (death) => {
      updatePlayer(death.id, 'isDead', true);

      const you = death.shooter === socket.id ? 'killer' : death.id === socket.id ? 'victim' : null;
      pushKill({ killer: death.shooterName, victim: death.playerName, you, headshot: !!death.headshot });

      const milestone = isStreakMilestone(death.streak);
      const ended = death.endedStreak >= STREAK_MIN ? death.endedStreak : 0;
      if (you === 'killer') {
        // Your own kills get the callout over the crosshair instead of a notice.
        hud.showHitMarker('kill');
        const endedLine = ended ? `You ended ${death.playerName}'s ${ended}-kill streak` : undefined;
        if (milestone) hud.showCallout(`${death.streak}-kill streak`, endedLine ?? (death.headshot ? 'Headshot' : undefined));
        else if (ended) hud.showCallout(death.headshot ? 'Headshot' : 'Streak ended', endedLine);
        else if (death.headshot) hud.showCallout('Headshot');
        return;
      }
      if (milestone) pushNotice(`${death.shooterName} is on a ${death.streak}-kill streak`);
      if (ended) {
        const whose = you === 'victim' ? 'your' : `${death.playerName}'s`;
        pushNotice(`${death.shooterName} ended ${whose} ${ended}-kill streak`);
      }
      if (you === 'victim') {
        setKilledBy(death.shooterName);
        setIsDead(true);
      }
    };

    const onPlayerKilled = (player) => updatePlayer(player.id, 'kills', player.kills);

    const onPlayerRespawned = (player) => {
      removePlayer(player.id);
      if (player.id !== socket.id) resetRemote(player.id, player.position);
      protect(player);
      const timeoutId = setTimeout(() => {
        respawnTimeouts.delete(timeoutId);
        if (player.id === socket.id) {
          setIsDead(false);
        }
        setPlayer({ ...player, isDead: false });
      }, 1000);
      respawnTimeouts.add(timeoutId);
    };

    const onNotification = ({ message }) => pushNotice(message);

    const onProtectionEnded = ({ id }) => protect({ id, protection: 0 });
    // Regeneration (damage comes with 'hit', handled by Player).
    const onHealth = ({ health }) => updatePlayer(socket.id, 'health', health);

    const onTimerUpdate = (remaining) => setTimeRemaining(remaining);
    const onGameOver = () => setIsGameOver(true);

    // The same room starts over: fresh scores and positions, like joining again.
    const onMatchStarted = ({ players: all, duration }) => {
      respawnTimeouts.forEach(clearTimeout);
      respawnTimeouts.clear();
      setIsGameOver(false);
      setIsDead(false);
      setKilledBy(null);
      setRematch(NO_REMATCH);
      setTimeRemaining(duration);
      onCurrentPlayers(all);
      setLeaderboard(all);
    };
    const onJoinedRoom = () => {
      setIsJoinedRoom(true);
      setIsReconnecting(false);
    };

    // Handle player disconnection
    const onPlayerDisconnected = (id) => {
      removeRemote(id);
      removePlayer(id);
    };

    const handlers = {
      reconnecting: onReconnecting,
      disconnect: onDisconnect,
      currentPlayers: onCurrentPlayers,
      leaderboardAllPlayers: setLeaderboard,
      newPlayer: onNewPlayer,
      playerMoved: onPlayerMoved,
      playerShot: onPlayerShot,
      playerDead: onPlayerDead,
      playerKilled: onPlayerKilled,
      playerRespawned: onPlayerRespawned,
      protectionEnded: onProtectionEnded,
      health: onHealth,
      notification: onNotification,
      timerUpdate: onTimerUpdate,
      gameOver: onGameOver,
      rematchVotes: setRematch,
      matchStarted: onMatchStarted,
      joinedRoom: onJoinedRoom,
      playerDisconnected: onPlayerDisconnected,
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);

    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      respawnTimeouts.forEach(clearTimeout);
    };
  }, []);

  const reSpawnHandler = () => {
    socket.emit('respawn', socket.id);
  };

  const handleRematch = () => socket.emit('rematch');
  const handleLeave = () => socket.leave();

  const handleJoinRoom = (roomInfo) => {
    setRoomId(roomInfo.roomId);
    socket.emit('joinRoom', roomInfo);
  };

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
          killedBy={killedBy}
          myId={socket.id}
          rematch={rematch}
          onRematch={handleRematch}
          onLeave={handleLeave}
        />
      ) : (
        <></>
      )}
      {isReconnecting && <Reconnecting />}

      <Hud
        timeRemaining={timeRemaining}
        health={players[socket.id]?.health}
        deaths={players[socket.id]?.deaths}
        kills={players[socket.id]?.kills}
        roomId={roomId}
      />
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
              <Loading />
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
