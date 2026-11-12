import React, { memo, Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { DEFAULT_MAP, getMap } from '@rimfire/shared/maps';
import { World } from '@/maps/World';
import { Player } from '@/Player.jsx';
import { socket } from '@/net/socket';
import { stopHosting } from '@/net/lan/host';
import { closeTunnels } from '@/net/lan/nearby';
import {
  clearRemotes,
  dispatchShot,
  pushSnapshot,
  removeRemote,
  resetRemote,
  setProtection,
  setRemoteWeapon,
} from '@/net/remotePlayers';
import { WORLD_FOV } from '@/game/constants';
import { teamName } from '@/game/teams';
import { IS_TOUCH, LOW_QUALITY } from '@/config';
import { usePointerLockControlsStore } from './store/PointerLockControlStore';
import RespawnPopup from './UI/RespawnPopup/RespawnPopup';
import { usePlayerStore } from './store/PlayersStore';
import { useHudStore } from './store/HudStore';
import { RemotePlayer } from './RemotePlayer';
import RoomSelector from './UI/RoomSelector/RoomSelector';
import UI from './UI/UI';
import FpsMeter from './UI/FpsMeter/FpsMeter';
import Hud from './UI/Hud/Hud';
import { Loading, Reconnecting } from './UI/Status/Status';
import { useFeedStore } from './store/FeedStore';
import { useWeaponStore } from './store/WeaponStore';
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
  const [nearby, setNearby] = useState(null); // in a nearby game: the host's address
  const [mapId, setMapId] = useState(DEFAULT_MAP);
  const [killedBy, setKilledBy] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [rematch, setRematch] = useState(NO_REMATCH);
  const [mode, setMode] = useState('ffa');
  const [teamScores, setTeamScores] = useState(null); // { a, b } in a team match
  // Your team, kept here because you drop out of `players` for a moment while you respawn.
  const [myTeam, setMyTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // the map and models, see LoadingSignal

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
      // Out of a nearby game: stop hosting it (its players are told), or close the way to it.
      stopHosting();
      closeTunnels();
      setIsReconnecting(false);
      setIsJoinedRoom(false);
      respawnTimeouts.forEach(clearTimeout); // a respawn from the room you left would come back as a ghost
      respawnTimeouts.clear();
      setIsDead(false);
      setKilledBy(null);
      setIsGameOver(false);
      setRematch(NO_REMATCH);
      setMode('ffa');
      setTeamScores(null);
      setMyTeam(null);
      setPlayers({});
      clearRemotes();
      hud.setProtection(0);
    };

    // In a team match, say which team you're on: when you join (or come back) and when a rematch starts.
    let announceTeam = false;

    // Handle current players. The server says which gun each one holds, yours included: after a reconnect
    // it has the last word on a switch that may never have reached it.
    const onCurrentPlayers = (currentPlayers) => {
      clearRemotes();
      for (const id in currentPlayers) {
        const player = currentPlayers[id];
        if (id !== socket.id) {
          resetRemote(id, player.position, player.rotation?.y);
          setRemoteWeapon(id, player.weapon);
        } else if (player.weapon) {
          useWeaponStore.getState().setWeapon(player.weapon);
        }
        protect(player);
      }
      setPlayers(currentPlayers);
      // Back in a match you were dead in (a reconnect, or a reload inside the grace period): the server still
      // has you down, and its playerDead may never have reached you, so this is what brings up Respawn.
      setIsDead(!!currentPlayers[socket.id]?.isDead);
      const team = currentPlayers[socket.id]?.team ?? null;
      setMyTeam(team);
      if (announceTeam && team) hud.showCallout(`${teamName(team)} team`, 'Most team kills wins');
      announceTeam = false;
    };

    // Handle new player
    const onNewPlayer = (newPlayer) => {
      resetRemote(newPlayer.id, newPlayer.position);
      setRemoteWeapon(newPlayer.id, newPlayer.weapon);
      protect(newPlayer);
      setPlayer({ ...newPlayer, isDead: false });
    };

    const onPlayerWeapon = ({ id, weapon }) => setRemoteWeapon(id, weapon);

    // Movement goes straight into the interpolation buffers, not into React state.
    const onPlayerMoved = (data) => pushSnapshot(data.id, data);
    const onPlayerShot = (data) => dispatchShot(data.id, data);

    // `streak` is the shooter's, counting this kill; `endedStreak` is the one the victim had going.
    const onPlayerDead = (death) => {
      updatePlayer(death.id, 'isDead', true);

      const you = death.shooter === socket.id ? 'killer' : death.id === socket.id ? 'victim' : null;
      pushKill({
        killer: death.shooterName,
        victim: death.playerName,
        you,
        headshot: !!death.headshot,
        weapon: death.weapon,
        killerTeam: death.shooterTeam ?? null,
        victimTeam: death.team ?? null,
      });

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
      // The server evens out lopsided teams as players respawn.
      const before = usePlayerStore.getState().players[player.id]?.team;
      if (player.id === socket.id && player.team && before && before !== player.team) {
        pushNotice(`You're on ${teamName(player.team)} now, to even out the teams`);
      }
      if (player.id === socket.id) setMyTeam(player.team ?? null);
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
    const onMatchStarted = ({ players: all, duration, teamScores: scores = null }) => {
      respawnTimeouts.forEach(clearTimeout);
      respawnTimeouts.clear();
      setIsGameOver(false);
      setIsDead(false);
      setKilledBy(null);
      setRematch(NO_REMATCH);
      setTimeRemaining(duration);
      setTeamScores(scores);
      announceTeam = true;
      onCurrentPlayers(all);
      setLeaderboard(all);
    };
    const onJoinedRoom = ({ map, mode: roomMode } = {}) => {
      setMapId(map ?? DEFAULT_MAP);
      setMode(roomMode ?? 'ffa');
      announceTeam = true;
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
      playerWeapon: onPlayerWeapon,
      playerDead: onPlayerDead,
      playerKilled: onPlayerKilled,
      playerRespawned: onPlayerRespawned,
      protectionEnded: onProtectionEnded,
      health: onHealth,
      notification: onNotification,
      timerUpdate: onTimerUpdate,
      gameOver: onGameOver,
      rematchVotes: setRematch,
      teamScores: setTeamScores,
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

  const handleJoinRoom = ({ nearby: hostAddress = null, ...roomInfo }) => {
    setRoomId(hostAddress ? null : roomInfo.roomId);
    setNearby(hostAddress);
    socket.emit('joinRoom', roomInfo);
  };

  if (!isJoinedRoom) {
    return <RoomSelector joinRoom={handleJoinRoom} />;
  }

  const map = getMap(mapId);

  return (
    <>
      {isDead || isGameOver ? (
        <RespawnPopup
          isGameOver={isGameOver}
          leaderboard={leaderboard}
          reSpawnHandler={reSpawnHandler}
          killedBy={killedBy}
          myId={socket.id}
          myTeam={myTeam}
          teamScores={mode === 'tdm' ? teamScores : null}
          rematch={rematch}
          onRematch={handleRematch}
          onLeave={handleLeave}
        />
      ) : (
        <></>
      )}
      {isReconnecting && <Reconnecting />}
      {isLoading && <Loading />}

      <Hud
        timeRemaining={timeRemaining}
        health={players[socket.id]?.health}
        deaths={players[socket.id]?.deaths}
        kills={players[socket.id]?.kills}
        roomId={roomId}
        nearby={nearby}
        mapName={map.name}
        myTeam={myTeam}
        teamScores={mode === 'tdm' ? teamScores : null}
      />
      <UI />
      <FpsMeter />
      {IS_TOUCH && !isDead && !isGameOver && <TouchControls />}
      <Canvas
        camera={{ fov: WORLD_FOV, near: 0.05, far: 1000 }}
        dpr={LOW_QUALITY ? 1 : [1, 1.5]}
        shadows={!LOW_QUALITY}
      >
        <Suspense fallback={<LoadingSignal onChange={setIsLoading} />}>
          <Scene map={map} players={players} myTeam={myTeam} isDead={isDead} isGameOver={isGameOver} />
        </Suspense>
      </Canvas>
    </>
  );
};

export default App;

// The canvas's Suspense fallback: says the map is loading for as long as it's up, so the loading screen can be
// plain DOM over the canvas. (drei's Html in the fallback threw on unmount with React 19.)
function LoadingSignal({ onChange }) {
  useEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}

// Memoized, like World and the players in it: App re-renders on every timer tick and HUD change, and taking
// the 3D tree along cost a long frame (50-70 ms) each time on a low-end phone.
const Scene = memo(function Scene({ map, players, myTeam, isDead, isGameOver }) {
  const pointerLockControlsLockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: true });
  };

  const pointerLockControlsUnlockHandler = () => {
    usePointerLockControlsStore.setState({ isLock: false });
  };

  return (
    <>
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
      {/* Step physics before any game logic so the player reads this frame's interpolated pose. */}
      <Physics gravity={[0, -9.8, 0]} updatePriority={-50}>
        <World map={map} />
        {!isGameOver ? (
          Object.keys(players).map((id) =>
            id === socket.id ? (
              <Player
                key={id}
                initialPosition={players[id].position}
                initialYaw={players[id].rotation?.y}
                fall={map.fall.y}
                fallReset={map.fall.reset ?? map.spawns[0]}
                isDead={players[id].isDead}
              />
            ) : (
              <RemotePlayer
                key={id}
                id={id}
                initialPosition={players[id].position}
                isDead={players[id].isDead}
                playerName={players[id].playerName}
                team={players[id].team}
                myTeam={myTeam}
              />
            )
          )
        ) : (
          <></>
        )}
      </Physics>
    </>
  );
});
