import { create } from 'zustand';

// Short-lived messages: the kill feed (top left in a match) and notices such as "Room not found"
// (top centre, on the menu too). Each entry removes itself after a few seconds.

export interface IKill {
  id: number;
  killer: string;
  victim: string;
  /** Which side you were on, if either. */
  you: 'killer' | 'victim' | null;
  headshot: boolean;
  /** The gun, as a weapon id. */
  weapon?: string;
  /** In a team match, each side's team ('a' or 'b'); null otherwise. */
  killerTeam?: string | null;
  victimTeam?: string | null;
}

export interface INotice {
  id: number;
  text: string;
}

export interface IFeedStore {
  kills: IKill[];
  notices: INotice[];
  pushKill: (kill: Omit<IKill, 'id'>) => void;
  pushNotice: (text: string) => void;
}

export const KILL_TTL = 6000; // ms; the feed's fade-out (Feed.module.scss) ends with it
export const NOTICE_TTL = 5000;
const MAX_KILLS = 5;
const MAX_NOTICES = 3;

let nextId = 1;

export const useFeedStore = create<IFeedStore>()((set) => ({
  kills: [],
  notices: [],
  pushKill: (kill) => {
    const id = nextId++;
    set((s) => ({ kills: [...s.kills, { ...kill, id }].slice(-MAX_KILLS) }));
    setTimeout(() => set((s) => ({ kills: s.kills.filter((k) => k.id !== id) })), KILL_TTL);
  },
  pushNotice: (text) => {
    const id = nextId++;
    set((s) => ({ notices: [...s.notices, { id, text }].slice(-MAX_NOTICES) }));
    setTimeout(() => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), NOTICE_TTL);
  },
}));
