import { RoomHost, serveRelay } from '@rimfire/game';

// The room of a nearby game this phone hosts, off the main thread so the host's own game doesn't feel it. It is
// the same RoomHost the Cloudflare server runs; LanPlugin's server relays every player to it over one WebSocket.
//
// Messages: { url, settings } starts it ('ready' once the channel is open), 'stop' ends the match for everyone
// and closes the channel. 'closed' says the channel is gone.

let host = null;
let channel = null;

self.onmessage = ({ data }) => {
  if (data === 'stop') {
    if (host?.game) host.closeRoom('The host left, so the game is over.');
    channel?.close(); // after the frames closeRoom queued
    return;
  }
  host = new RoomHost({ settings: data.settings });
  channel = new WebSocket(data.url);
  const receive = serveRelay(host, channel);
  channel.onopen = () => self.postMessage('ready');
  channel.onmessage = (e) => receive(e.data);
  channel.onclose = () => self.postMessage('closed');
};
