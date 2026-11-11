import { LAN_PORT, Lan, NEARBY_VERSION } from './native';

let current = null; // { worker, closed: Promise } while this phone hosts

/**
 * Hosts a nearby game: LanPlugin's server for players to connect to, the room in a Web Worker. Resolves with the
 * `server` the host's own player joins on and the `addresses` others can join on.
 *
 * @param {{ playerName: string, settings: { map, mode, duration, playersLimit, bots } }} game
 */
export async function startHosting({ playerName, settings }) {
  await stopHosting();
  const { port, token, addresses } = await Lan.startHost({
    port: LAN_PORT,
    // What players looking for games see (with how many are connected).
    info: {
      game: 'rimfire',
      v: NEARBY_VERSION,
      name: playerName,
      map: settings.map,
      mode: settings.mode,
      limit: Number(settings.playersLimit),
    },
  });
  const worker = new Worker(new URL('./hostWorker.js', import.meta.url), { type: 'module' });
  try {
    await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => (data === 'ready' ? resolve() : reject(new Error('The room closed')));
      worker.onerror = reject;
      worker.postMessage({ url: `ws://127.0.0.1:${port}/host?token=${token}`, settings });
    });
  } catch (error) {
    worker.terminate();
    await Lan.stopHost();
    throw error;
  }
  const closed = new Promise((resolve) => {
    worker.onmessage = ({ data }) => data === 'closed' && resolve();
  });
  current = { worker, closed };
  return { server: `ws://127.0.0.1:${port}`, addresses };
}

/** Ends the hosted game, if any: its players are told the host left, then the server stops. */
export async function stopHosting() {
  const hosting = current;
  if (!hosting) return;
  current = null;
  hosting.worker.postMessage('stop');
  await Promise.race([hosting.closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
  hosting.worker.terminate();
  await Lan.stopHost().catch(() => {});
}
