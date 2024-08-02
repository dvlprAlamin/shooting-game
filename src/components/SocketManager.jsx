import { socketEvent } from '@/enum/socketEvent';
import { usePlayerStore } from '@/store/PlayersStore';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

// eslint-disable-next-line react-refresh/only-export-components
export const socket = io('http://localhost:4000');

export const SocketManager = () => {
  const { setPlayers, setCurrentPlayer } = usePlayerStore();
  const players = usePlayerStore((state) => state.players);
  console.log('playersrrrrrrrrrrrrr', players);

  useEffect(() => {
    function onConnect() {
      console.log('connected');
    }
    function onDisconnect() {
      console.log('disconnected');
    }

    function onInitialize(player) {
      setCurrentPlayer(player);
      // console.log('value', value);
      // setPlayers(value.players);
    }

    function onPlayers(players) {
      setPlayers(players);
    }

    function onPlayerMove(players) {
      setPlayers(players);
      // console.log('player', player);
      // console.log(value.id, value.position);
    }
    // function onMapUpdate(value) {
    //   setMap(value.map);
    //   setCharacters(value.characters);
    // }

    socket.on(socketEvent.CONNECT, onConnect);
    socket.on(socketEvent.DISCONNECT, onDisconnect);
    socket.on(socketEvent.INITIALIZE, onInitialize);
    socket.on(socketEvent.PLAYERS, onPlayers);
    socket.on(socketEvent.PLAYER_MOVE, onPlayerMove);
    // socket.on('mapUpdate', onMapUpdate);
    return () => {
      socket.off(socketEvent.CONNECT, onConnect);
      socket.off(socketEvent.DISCONNECT, onDisconnect);
      socket.off(socketEvent.INITIALIZE, onInitialize);
      socket.off(socketEvent.PLAYERS, onPlayers);
      socket.off(socketEvent.PLAYER_MOVE, onPlayerMove);
      // socket.off('mapUpdate', onMapUpdate);
    };
  }, []);
};
