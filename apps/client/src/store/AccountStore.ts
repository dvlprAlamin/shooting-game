import { create } from 'zustand';

// Who this device is signed in as, if anyone (see net/account.js). Kept on the device only: the server keeps
// just which profile each account plays as.
export interface IAccount {
  provider: 'google';
  /** Shown as who you're signed in as. From Google's sign-in; the server doesn't keep it. */
  email: string | null;
}

export interface IAccountStore {
  account: IAccount | null;
  setAccount: (account: IAccount | null) => void;
}

const KEY = 'account';

const load = (): IAccount | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.provider !== 'google') return null;
    return { provider: 'google', email: typeof saved.email === 'string' ? saved.email : null };
  } catch {
    return null;
  }
};

export const useAccountStore = create<IAccountStore>()((set) => ({
  account: load(),
  setAccount: (account) => {
    try {
      if (account) localStorage.setItem(KEY, JSON.stringify(account));
      else localStorage.removeItem(KEY);
    } catch {
      // Private mode: signed in for this visit only.
    }
    set(() => ({ account }));
  },
}));
