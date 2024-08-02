import { create } from 'zustand';
interface Player {
  id: string;
  position: number[];
}
export interface IPlayerStore {
  currentPlayer: Player | null;
  setCurrentPlayer: (value: Player) => void;
  players: Record<string, object[]>;
  setPlayers: (value: Record<string, object[]>) => void;
}

export const usePlayerStore = create<IPlayerStore>()((set) => ({
  currentPlayer: null,
  setCurrentPlayer: (value) => set(() => ({ currentPlayer: value })),
  players: {},
  setPlayers: (value) =>
    set(() => ({
      players: value,
    })),
}));
