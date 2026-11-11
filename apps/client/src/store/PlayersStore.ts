import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Team } from '@rimfire/shared';
interface Player {
  id: string;
  playerName: string;
  position: number[];
  rotation: number[];
  deaths: number;
  health: number;
  kills: number;
  streak: number;
  bestStreak: number;
  isDead?: boolean;
  /** ms of spawn protection left when the server sent this */
  protection: number;
  /** In a team match, 'a' or 'b'; null otherwise. */
  team?: Team | null;
  /** Played by the server (quick play and practice rooms). */
  bot?: boolean;
}
type Players = Record<string, Player>; // by player id
export interface IPlayerStore {
  currentPlayer: Player | null;
  setCurrentPlayer: (player: Player) => void;
  players: Players;
  leaderboard: Players;
  setLeaderboard: (players: Players) => void;
  setPlayers: (players: Players) => void;
  setPlayer: (player: Player) => void;
  updatePlayer: <K extends keyof Player>(id: string, key: K, value: Player[K]) => void;
  removePlayer: (playerId: string) => void;
}

export const usePlayerStore = create<IPlayerStore>()(
  immer((set) => ({
    currentPlayer: null,
    setCurrentPlayer: (player) =>
      set((state) => {
        state.currentPlayer = player;
      }),
    players: {},
    setPlayers: (players) =>
      set((state) => {
        state.players = players;
      }),
    leaderboard: {},
    setLeaderboard: (players) =>
      set((state) => {
        state.leaderboard = players;
      }),
    setPlayer: (player: Player) =>
      set((state) => {
        state.players[player.id] = player;
      }),
    updatePlayer: (id, key, value) =>
      set((state) => {
        if (state.players[id]) {
          state.players[id][key] = value;
        }
      }),
    removePlayer: (playerId: string) =>
      set((state) => {
        delete state.players[playerId];
      }),
  }))
);
