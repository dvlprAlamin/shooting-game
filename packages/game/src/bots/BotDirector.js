import { EYE_HEIGHT, PLAYER_CENTER_TO_FEET, RESPAWN_DELAY } from '@rimfire/shared';
import { getWeapon } from '@rimfire/shared/weapons';
import { wallBetween } from '../walls.js';
import { buildNav, findPath } from './nav.js';

// How bots play. They are ordinary players in the room (same rules, same checks on every shot), driven from
// here instead of from a client: GameRoom.updateBots() calls update() UPDATE_MS apart.

export const UPDATE_MS = 50; // as often as clients send their moves
const LOOK_EVERY_MS = 200; // how often a bot looks around for enemies
const SIGHT = 60; // m
const FOV_COS = Math.cos((65 * Math.PI) / 180); // they see 130° ahead...
const HEARING = 12; // ...and notice anyone this close, behind them or not
const TURN_RATE = 5; // rad/s
const REACTION_MS = [350, 750]; // from first seeing someone to the first shot
const BURST = [3, 7]; // shots
const BURST_PAUSE_MS = [250, 650];
const AIMED = 0.12; // rad: close enough to start firing
const ACCURACY = 0.42; // chance a shot hits a still target at point-blank range
const HEADSHOT_SHARE = 0.12; // of the hits
const RUN_SPEED = 4.5; // m/s, a player's walk speed
const STRAFE_SPEED = 2.6;
const RESPAWN_MS = [RESPAWN_DELAY, RESPAWN_DELAY + 3000]; // no sooner than people can, and about when theirs is automatic
const LOW_HEALTH = 40; // they use their medkit below this, when nobody is around
const GROUNDED = 1; // movement flag (client FLAG_GROUNDED)
const GUNS = ['rifle', 'rifle', 'rifle', 'smg']; // what a bot picks when it spawns

export const BOT_NAMES = [
    'Rook', 'Viper', 'Mako', 'Juno', 'Kestrel', 'Onyx', 'Sable', 'Talon',
    'Ember', 'Nova', 'Flint', 'Gale', 'Hex', 'Moss', 'Quill', 'Rune',
];

const between = ([lo, hi], random) => lo + (hi - lo) * random();
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const eyeOf = (p) => ({ x: p.position.x, y: p.position.y + EYE_HEIGHT, z: p.position.z });

/** Can bots play on this map? (They need a nav grid: block maps only, for now.) */
export const botsCanPlay = (map) => buildNav(map) !== null;

export class BotDirector {
    /** @param {import('../GameRoom.js').GameRoom} room */
    constructor(room) {
        this.room = room;
        this.nav = buildNav(room.map);
        this.state = new Map(); // bot id -> its plans
    }

    /** A bot (already in room.players) starts thinking. */
    add(id) {
        this.state.set(id, {
            path: [], // nav nodes still to walk through
            goal: -1,
            target: null, // id of the enemy it's after
            reactAt: 0,
            nextLook: 0,
            nextShot: 0,
            burst: 0,
            strafe: null, // { to: node, until: time }
            respawnAt: 0,
            lastSeen: null, // where the target was last seen
        });
        this.spawned(id);
    }

    remove(id) {
        this.state.delete(id);
    }

    // Just (re)spawned: pick a gun and forget the old plans.
    spawned(id) {
        const s = this.state.get(id);
        if (!s) return;
        Object.assign(s, { path: [], goal: -1, target: null, strafe: null, lastSeen: null });
        const gun = GUNS[Math.floor(this.room.random() * GUNS.length)];
        this.room.switchWeapon(id, { w: gun });
    }

    update(now) {
        for (const [id, s] of this.state) {
            const bot = this.room.players[id];
            if (!bot) continue;
            if (bot.isDead) {
                if (!s.respawnAt) s.respawnAt = now + between(RESPAWN_MS, this.room.random);
                else if (now >= s.respawnAt) {
                    s.respawnAt = 0;
                    this.room.respawn(id);
                    this.spawned(id);
                }
                continue;
            }
            this.room.settle(bot, now);
            if (now >= s.nextLook) {
                s.nextLook = now + LOOK_EVERY_MS;
                this.look(bot, s, now);
            }
            const target = s.target && this.room.players[s.target];
            if (target) this.fight(bot, s, target, now);
            else this.roam(bot, s, now);
        }
    }

    // Finds the nearest enemy it can see (or hear), keeping its current target while it's still in view.
    look(bot, s, now) {
        const eye = eyeOf(bot);
        const yaw = bot.rotation.y;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        let best = null;
        let bestD = Infinity;
        for (const id in this.room.players) {
            const p = this.room.players[id];
            if (p === bot || p.isDead || !p.position || this.room.sameTeam(p, bot) || p.protectedUntil > now) continue;
            if (!p.bot && !p.movedAt) continue; // their game is still loading: no move from them since they spawned
            const dx = p.position.x - eye.x;
            const dz = p.position.z - eye.z;
            const d = Math.hypot(dx, p.position.y - eye.y, dz);
            if (d > SIGHT) continue;
            const inView = d < HEARING || (dx * fx + dz * fz) / Math.max(1e-6, Math.hypot(dx, dz)) > FOV_COS;
            if (!inView || wallBetween(this.room.map, eye, p.position)) continue;
            // A little stickiness: the current target wins ties.
            const score = id === s.target ? d - 5 : d;
            if (score < bestD) {
                bestD = score;
                best = p;
            }
        }
        if (best) {
            if (best.id !== s.target) {
                s.target = best.id;
                s.reactAt = now + between(REACTION_MS, this.room.random);
                s.burst = Math.round(between(BURST, this.room.random));
            }
            s.lastSeen = { ...best.position };
        } else if (s.target) {
            // Lost sight: go and look where they were.
            s.target = null;
            s.strafe = null;
            if (s.lastSeen) this.goTo(bot, s, this.nav.at(s.lastSeen.x, s.lastSeen.z, s.lastSeen.y - PLAYER_CENTER_TO_FEET));
        }
    }

    fight(bot, s, target, now) {
        const room = this.room;
        const eye = eyeOf(bot);
        const aimY = target.position.y + 0.25; // chest
        const dx = target.position.x - eye.x;
        const dy = aimY - eye.y;
        const dz = target.position.z - eye.z;
        const flat = Math.hypot(dx, dz);
        const dist = Math.hypot(flat, dy);
        const wantYaw = Math.atan2(-dx, -dz);
        const wantPitch = Math.atan2(dy, flat);
        const yaw = this.turn(bot.rotation.y, wantYaw);
        const pitch = this.turn(bot.rotation.x, wantPitch);

        // Side-step now and then while shooting.
        let pos = bot.position;
        if (!s.strafe || now >= s.strafe.until) s.strafe = this.pickStrafe(bot, wantYaw, now);
        if (s.strafe?.to >= 0) pos = this.stepTowards(bot, s.strafe.to, STRAFE_SPEED) ?? pos;
        this.place(bot, pos, yaw, pitch, now);

        const weapon = getWeapon(bot.weapon);
        if (bot.reloadAt || bot.healAt || now < bot.readyAt) return;
        if (bot.rounds[weapon.id] <= 0) {
            room.reload(bot.id);
            return;
        }
        if (now < s.reactAt || now < s.nextShot || Math.abs(angleDiff(yaw, wantYaw)) > AIMED) return;

        // Hit or miss by chance: worse with range, when either of them moves, and for guns made for close range.
        const reach = weapon.falloff ? weapon.falloff[1] : 120;
        const moving = s.strafe?.to >= 0 ? 0.85 : 1;
        const chance = ACCURACY * Math.max(0.12, 1 - dist / reach) * moving;
        const hit = room.random() < chance;
        const head = hit && room.random() < HEADSHOT_SHARE;
        const toY = head ? target.position.y + 0.75 : aimY;
        let dir = { x: dx, y: toY - eye.y, z: dz };
        if (!hit) {
            // Miss wide: off to one side by up to ~1.5 m at the target.
            const side = (room.random() - 0.5) * 3;
            dir = { x: dx + Math.cos(wantYaw) * side, y: dir.y + (room.random() - 0.5), z: dz - Math.sin(wantYaw) * side };
        }
        const len = Math.hypot(dir.x, dir.y, dir.z);
        room.shoot(bot.id, {
            o: eye,
            d: { x: dir.x / len, y: dir.y / len, z: dir.z / len },
            target: hit ? target.id : null,
            head,
        });

        s.burst -= 1;
        if (s.burst <= 0 || !weapon.auto) {
            s.burst = Math.round(between(BURST, room.random));
            s.nextShot = now + (weapon.auto ? between(BURST_PAUSE_MS, room.random) : weapon.fireInterval + 150);
        } else {
            s.nextShot = now + weapon.fireInterval;
        }
    }

    roam(bot, s, now) {
        const room = this.room;
        if (bot.health < LOW_HEALTH && bot.medkits > 0 && !bot.healAt) room.heal(bot.id);
        if (bot.rounds[bot.weapon] < getWeapon(bot.weapon).magSize / 3 && !bot.reloadAt) room.reload(bot.id);

        if (!s.path.length) {
            // Head for an enemy half the time (so fights happen), anywhere else otherwise.
            const enemies = Object.values(room.players).filter((p) => p !== bot && !p.isDead && !room.sameTeam(p, bot) && p.position);
            let goal;
            if (enemies.length && room.random() < 0.5) {
                const e = enemies[Math.floor(room.random() * enemies.length)];
                goal = this.nav.at(e.position.x, e.position.z, e.position.y - PLAYER_CENTER_TO_FEET);
            } else {
                goal = Math.floor(room.random() * this.nav.nodes.length);
            }
            this.goTo(bot, s, goal);
            if (!s.path.length) return this.place(bot, bot.position, bot.rotation.y, 0, now);
        }

        const next = s.path[0];
        const pos = this.stepTowards(bot, next, RUN_SPEED);
        const node = this.nav.nodes[next];
        const yaw = this.turn(bot.rotation.y, Math.atan2(-(node.x - bot.position.x), -(node.z - bot.position.z)));
        if (!pos) {
            s.path.shift(); // there
            return this.place(bot, { x: node.x, y: node.y + PLAYER_CENTER_TO_FEET, z: node.z }, yaw, 0, now);
        }
        this.place(bot, pos, yaw, this.turn(bot.rotation.x, 0), now);
    }

    goTo(bot, s, goal) {
        if (goal < 0) return;
        const p = bot.position;
        const from = this.nav.at(p.x, p.z, p.y - PLAYER_CENTER_TO_FEET);
        s.path = (from >= 0 && findPath(this.nav, from, goal)) || [];
        s.goal = goal;
    }

    // A neighbouring node to one side of the line to the enemy, or none (stand still) for a while.
    pickStrafe(bot, towardsYaw, now) {
        const until = now + 600 + this.room.random() * 900;
        if (this.room.random() < 0.35) return { to: -1, until };
        const p = bot.position;
        const here = this.nav.at(p.x, p.z, p.y - PLAYER_CENTER_TO_FEET);
        if (here < 0) return { to: -1, until };
        const sx = Math.cos(towardsYaw); // to the right of the way it faces
        const sz = -Math.sin(towardsYaw);
        const side = this.room.random() < 0.5 ? 1 : -1;
        let best = -1;
        let bestDot = 0.5;
        for (const n of this.nav.links[here]) {
            const q = this.nav.nodes[n];
            const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
            const dot = (((q.x - p.x) * sx + (q.z - p.z) * sz) / len) * side;
            if (dot > bestDot) {
                bestDot = dot;
                best = n;
            }
        }
        return { to: best, until };
    }

    // Where the bot gets to this update walking towards node n at `speed`, or null if it reaches n.
    stepTowards(bot, n, speed) {
        const node = this.nav.nodes[n];
        const p = bot.position;
        const ty = node.y + PLAYER_CENTER_TO_FEET;
        const dx = node.x - p.x;
        const dy = ty - p.y;
        const dz = node.z - p.z;
        const d = Math.hypot(dx, dz);
        const step = (speed * UPDATE_MS) / 1000;
        if (d <= step) return null;
        const k = step / d;
        return { x: p.x + dx * k, y: p.y + dy * k, z: p.z + dz * k };
    }

    turn(from, to) {
        const max = (TURN_RATE * UPDATE_MS) / 1000;
        const d = angleDiff(to, from);
        return from + Math.max(-max, Math.min(max, d));
    }

    // Moves the bot the way a client's move message would, so everyone sees it.
    place(bot, pos, yaw, pitch, now) {
        this.room.move(bot.id, { t: now, p: [pos.x, pos.y, pos.z], yaw, pitch, f: GROUNDED });
    }
}
