import { create } from 'zustand';

// Whether this app is too old for a room it tried to join (the game server's, or a nearby game's): the menu then
// says to update, for the rest of the session. See PROTOCOL_VERSION in @rimfire/shared.

export const useUpdateStore = create<{ needed: boolean }>()(() => ({ needed: false }));

export const needUpdate = () => useUpdateStore.setState({ needed: true });

export const APP_OUTDATED = 'This version of RimFire is out of date. Update it to keep playing.';
export const HOST_OUTDATED = "The host's RimFire is older than yours. They need to update it to play with you.";
