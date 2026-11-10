import {create} from "zustand";
import { MAG_SIZE } from "@/shared/gameplay";

const defaultCountOfRounds = MAG_SIZE;

export interface IRoundsStore {
    countRounds: number;
    decreaseRounds: () => void;
    reloadRounds: () => void;
}

export const useRoundsStore = create<IRoundsStore>()((set) => ({
    countRounds: defaultCountOfRounds,
    decreaseRounds: () => set(({ countRounds }) => {
        return {
            countRounds: Math.max(countRounds - 1, 0)
        }
    }),
    reloadRounds: () => set(() => {
        return {
            countRounds: defaultCountOfRounds
        }
    })
}));