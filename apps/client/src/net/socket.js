import { SERVER_URL } from '@/config';
import { ROOM_ID_PATTERN } from '@shooter/shared';
import { getProfileId } from './profile';

// Connection to the game server: one WebSocket per room, `<server>/rooms/<roomId>`, carrying JSON
// frames {"e": event, "d": data}. The API matches what the game used with Socket.IO: on/off,
// emit, volatile.emit and id (your player id, from the server's joinedRoom message).
//
// It connects when you join a room. If the connection drops mid-game it reconnects with a per-tab
// key, and the server gives you your player back (score and all) during its 10 s grace period.
//
// Events it adds on top of the server's: 'reconnecting' (connection lost, retrying) and
// 'disconnect' (couldn't join, gave up reconnecting, the room closed, or you left).

const RETRY_DELAYS = [500, 1000, 2000, 3000, 3000]; // ~9.5 s in total, inside the server's grace period
// Close codes from the server (apps/server/src/game/RoomHost.js) that mean "don't retry".
const FINAL_CLOSE_CODES = new Set([4000, 4001, 4002, 4003, 4004]);
const REPLACED = 4003;
// A refused join (4000) and a closed room (4004) already came with a notification saying why.
const EXPLAINED_CLOSE_CODES = new Set([4000, 4004]);

const WS_BASE = SERVER_URL.replace(/^http/, 'ws').replace(/\/+$/, '');

// Identifies this tab's player to the server when reconnecting. Secret: never shown to other players.
const PLAYER_KEY = (() => {
  const make = () =>
    crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    let key = sessionStorage.getItem('playerKey');
    if (!key) {
      key = make();
      sessionStorage.setItem('playerKey', key);
    }
    return key;
  } catch {
    return make();
  }
})();

class GameSocket {
  id = null;
  #listeners = new Map();
  #ws = null;
  #join = null; // the join request, re-sent when reconnecting
  #joined = false;
  #reconnecting = false;
  #retry = 0;
  #retryTimer = null;

  // Movement is sent 20 times a second; if the connection is backed up, skip a packet rather than queue it.
  volatile = {
    emit: (event, data) => {
      if (!this.#ws?.bufferedAmount) this.emit(event, data);
    },
  };

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
  }

  off(event, fn) {
    this.#listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    if (event === 'joinRoom') this.#joinRoom(data);
    else if (this.#joined && this.#ws?.readyState === WebSocket.OPEN) this.#send(event, data);
  }

  /** Leave the room for good. The server drops your player at once instead of holding it for a reconnect. */
  leave() {
    const ws = this.#ws;
    if (this.#joined && ws?.readyState === WebSocket.OPEN) this.#send('leave');
    this.#ws = null; // so its close event is ignored
    ws?.close(1000);
    clearTimeout(this.#retryTimer);
    this.#join = null;
    this.#joined = false;
    this.#reconnecting = false;
    this.id = null;
    this.#fire('disconnect', 1000);
  }

  #fire(event, data) {
    for (const fn of [...(this.#listeners.get(event) ?? [])]) fn(data);
  }

  #send(event, data) {
    this.#ws.send(JSON.stringify(data === undefined ? { e: event } : { e: event, d: data }));
  }

  #joinRoom(info) {
    const roomId = String(info?.roomId ?? '').trim();
    if (!ROOM_ID_PATTERN.test(roomId)) return this.#fire('notification', { message: "That room code isn't valid." });
    if (this.#join) return this.#fire('notification', { message: "You're already in a room." });
    this.#join = { ...info, roomId, playerKey: PLAYER_KEY, profileId: getProfileId() };
    this.#retry = 0;
    this.#open();
  }

  #open() {
    const ws = new WebSocket(`${WS_BASE}/rooms/${encodeURIComponent(this.#join.roomId)}`);
    this.#ws = ws;
    ws.onopen = () => this.#send('joinRoom', this.#join);
    ws.onmessage = (message) => {
      let msg;
      try {
        msg = JSON.parse(message.data);
      } catch {
        return;
      }
      // While coming back, a refusal (e.g. the room is gone) is reported as a lost connection instead.
      if (msg.e === 'notification' && this.#reconnecting) return;
      if (msg.e === 'joinedRoom') {
        this.id = msg.d?.id ?? null;
        this.#joined = true;
        this.#reconnecting = false;
        this.#retry = 0;
        // From now on, joining again means coming back, never creating a new room.
        this.#join = { ...this.#join, isCreate: false };
      }
      this.#fire(msg.e, msg.d);
    };
    ws.onclose = (event) => this.#onClose(ws, event.code);
  }

  #onClose(ws, code) {
    if (this.#ws !== ws) return;
    this.#ws = null;
    if (this.#joined && !FINAL_CLOSE_CODES.has(code) && this.#retry < RETRY_DELAYS.length) {
      if (!this.#reconnecting) {
        this.#reconnecting = true;
        this.#fire('reconnecting');
      }
      this.#retryTimer = setTimeout(() => this.#open(), RETRY_DELAYS[this.#retry++]);
      return;
    }
    const wasJoined = this.#joined;
    clearTimeout(this.#retryTimer);
    this.#join = null;
    this.#joined = false;
    this.#reconnecting = false;
    this.id = null;
    if (code === REPLACED) this.#fire('notification', { message: 'You joined from another tab or device.' });
    else if (EXPLAINED_CLOSE_CODES.has(code)) {
      // The server's notification said why.
    } else if (wasJoined) this.#fire('notification', { message: 'Lost the connection to the game server.' });
    else this.#fire('notification', { message: "Can't reach the game server. Check your connection and try again." });
    this.#fire('disconnect', code);
  }
}

export const socket = new GameSocket();
