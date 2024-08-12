import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
interface Player {
  id: string;
  position: number[];
  rotation: number[];
  deaths: number;
  health: number;
  kills: number;
  isDead?: boolean;
}
export interface IPlayerStore {
  currentPlayer: Player | null;
  setCurrentPlayer: (player: Player) => void;
  players: any;
  setPlayers: (players: any) => void;
  setPlayer: (player: Player) => void;
  updatePlayer: (
    id: string,
    key: string,
    value: string | number | boolean
  ) => void;
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
    setPlayer: (player: Player) =>
      set((state) => {
        state.players[player.id] = player;
      }),
    updatePlayer: (id: string, key: string, value: string | number | boolean) =>
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
