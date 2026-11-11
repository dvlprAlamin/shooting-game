import { Capacitor, registerPlugin } from '@capacitor/core';

// Nearby games: matches over Wi-Fi or a phone's hotspot, no internet needed. One phone hosts (host.js), the
// others find it and join (nearby.js). The native half is the app's own plugin, with the same methods on both:
// android/app/src/main/java/com/dvlpralamin/rimfire/lan/LanPlugin.java and ios/App/App/Lan/LanPlugin.swift.
export const Lan = registerPlugin('Lan');

const platform = Capacitor.getPlatform();

/** The mobile apps only: a browser can't take connections, and from https it can't open ws:// to other devices. */
export const NEARBY = (platform === 'android' || platform === 'ios') && Capacitor.isPluginAvailable('Lan');

// The Android app's page is served from https://localhost, so it reaches other phones through the plugin's loopback
// tunnels (ws:// to them would be mixed content). The iOS app's, from capacitor://localhost, connects to them itself.
export const TUNNELS = platform === 'android';

// The port a host listens on (or the next free one after it): the one to try on a hotspot's gateway.
export const LAN_PORT = 7350;
// Hosts and players must speak the same game. Bump when the messages between them change.
export const NEARBY_VERSION = 1;
