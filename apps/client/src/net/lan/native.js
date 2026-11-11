import { Capacitor, registerPlugin } from '@capacitor/core';

// Nearby games: matches over Wi-Fi or a phone's hotspot, no internet needed. One phone hosts (host.js), the
// others find it and join (nearby.js). The native half is the Android app's own plugin,
// android/app/src/main/java/com/dvlpralamin/rimfire/lan/LanPlugin.java.
export const Lan = registerPlugin('Lan');

/** The Android app only: a browser can't take connections, and from https it can't open ws:// to other devices. */
export const NEARBY = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('Lan');

// The port a host listens on (or the next free one after it): the one to try on a hotspot's gateway.
export const LAN_PORT = 7350;
// Hosts and players must speak the same game. Bump when the messages between them change.
export const NEARBY_VERSION = 1;
