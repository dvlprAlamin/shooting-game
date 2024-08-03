import { create } from 'zustand';

interface IPointerLockControlsStore {
  isLock: boolean;
}

export const usePointerLockControlsStore = create<IPointerLockControlsStore>(
  () => ({
    isLock: false,
  })
);
