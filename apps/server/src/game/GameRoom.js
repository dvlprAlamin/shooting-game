import {
    EYE_HEIGHT,
    MAX_HEALTH,
    MAX_SHOT_DISTANCE,
    MODES,
    PLAYER_LIMITS,
    PLAYER_RADIUS,
    ROOM_DURATIONS,
    SPAWN_PROTECTION,
    TEAMS,
} from '@shooter/shared';
import { getMap } from '@shooter/shared/maps';
import { DEFAULT_WEAPON, MEDKIT, WEAPONS, damageAt, findWeapon, getWeapon } from '@shooter/shared/weapons';
import { findTarget, hitDistance } from './hits.js';
import { safeSpawn } from './spawns.js';
import { firstWallHit, wallBetween } from './walls.js';
import { BOT_NAMES, BotDirector, botsCanPlay } from './bots/BotDirector.js';

// Shots may arrive this much closer together than the gun's fire interval (network jitter).
const FIRE_JITTER = 20;
// Switching, reloading and using a medkit may finish this much early, for the same reason.
export const TIMING_SLACK = 150;
const HISTORY_MS = 1000;
const MAX_NAME_LENGTH = 24;
// How long a player whose connection dropped is kept in the room, waiting for them to come back.
export const RECONNECT_GRACE_MS = 10_000;
// Health comes back REGEN_PER_TICK each second once a player has gone REGEN_DELAY_MS without being hit.
export const REGEN_DELAY_MS = 5000;
export const REGEN_PER_TICK = 20;
// After the match, a rematch starts once everyone wants one, or this many seconds after more than half do.
export const REMATCH_WAIT = 10;
// A finished match that nobody restarts closes after this long, so an idle tab doesn't keep the room running.
export const GAME_OVER_TTL_MS = 3 * 60_000;
// A shot must start this close to the shooter's eyes (where their last move put them), on the same side of any wall.
export const MAX_ORIGIN_OFFSET = 3;
// A box on the shot's path counts as in the way only if the path enters it this far (m) before the target's
// body: the target's position is only known 20 times a second.
const WALL_SLACK = 0.3;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const isVec3 = (v) => v && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z);
// One of the offered options, or the default (first) one.
const option = (options, value) => (options.includes(Number(value)) ? Number(value) : options[0]);

// The public view of a player (what other clients receive).
const publicPlayer = (p, now) => ({
    id: p.id,
    playerName: p.playerName,
    position: p.position,
    rotation: p.rotation,
    health: p.health,
    deaths: p.deaths,
    kills: p.kills,
    streak: p.streak,
    bestStreak: p.bestStreak,
    isDead: p.isDead,
    protection: Math.max(0, p.protectedUntil - now), // ms of spawn protection left
    weapon: p.weapon,
    team: p.team, // null outside team matches
    bot: p.bot,
});

const fullMagazines = () => Object.fromEntries(WEAPONS.map((w) => [w.id, w.magSize]));

// A fresh life: full magazines, a medkit, nothing in progress. The gun in hand stays the same.
const rearm = (player) => {
    player.rounds = fullMagazines();
    player.medkits = MEDKIT.perLife;
    player.readyAt = 0;
    player.reloadAt = 0;
    player.healAt = 0;
};

const pushHistory = (player, now) => {
    player.history.push({ t: now, x: player.position.x, y: player.position.y, z: player.position.z });
    while (player.history.length && now - player.history[0].t > HISTORY_MS) player.history.shift();
};

/**
 * One match: its players, scores, timer and rules.
 *
 * It knows nothing about sockets. A transport passes client messages in (join, move, shoot, switchWeapon,
 * reload, heal, respawn, leave), calls tick() once a second, and delivers whatever the room hands to `send`.
 * That keeps the rules apart from the transport (RoomHost.js) and testable without one.
 *
 * Reconnecting: a transport that can tell a dropped connection from a deliberate leave calls
 * drop() instead of leave(). The player stays in the match for RECONNECT_GRACE_MS; joining again
 * with the same key (playerIdForKey + resume) gives them their player back, score and all.
 *
 * After the match the room stays open for a rematch (rematch() votes) until GAME_OVER_TTL_MS has
 * passed; then `expired` tells the transport to close it.
 *
 * Team matches (mode 'tdm'): each player is on one of TEAMS, newcomers on the smaller one. Teammates can't hurt
 * each other, spawns keep away from the other team only, and every kill scores for the killer's team
 * (`teamScores`). Teams that have drifted two or more apart are evened out as players respawn, and at a rematch.
 *
 * Profiles: a player who joined with a profile id has what they did handed to `onResults` (to be saved), once per
 * match: when it ends, or when they leave before that. Only finished matches count as played (and maybe won).
 *
 * Bots (`bots` option, on maps with a nav grid): the room keeps that many players in the match, topping up
 * with bots while there are fewer people and dropping one whenever someone joins a full room. They play by the
 * same rules (bots/BotDirector.js), driven by updateBots(). They don't vote for rematches, and a room with only
 * bots left counts as empty.
 *
 * Weapons (@shooter/shared/weapons): every player carries all of them and the room keeps count of each
 * one's magazine, so a client can't fire faster, longer or harder than its gun allows. Reloads and medkits
 * are timed here too, and finish on the player's next message after their time is up.
 */
export class GameRoom {
    /**
     * @param {object} options
     * @param {(playerId: string, event: string, data?: unknown, volatile?: boolean) => void} options.send
     *   Delivers one event to one player. `volatile` events may be dropped under load.
     * @param {number|string} [options.duration] match length in minutes, one of ROOM_DURATIONS
     * @param {number|string} [options.playersLimit] one of PLAYER_LIMITS
     * @param {string} [options.map] map id (see @shooter/shared/maps); unknown ids get the default map
     * @param {string} [options.mode] one of MODES; anything else gets the default (free-for-all)
     * @param {(results: object[]) => void} [options.onResults] gets players' results for their profiles
     * @param {number} [options.bots] players to keep in the match, filling up with bots (0: no bots)
     * @param {() => number} [options.now] clock in ms
     * @param {() => number} [options.random] random number in [0, 1)
     */
    constructor({ send, duration, playersLimit, map, mode, bots = 0, onResults = null, now = Date.now, random = Math.random }) {
        this.send = send;
        this.onResults = onResults;
        this.now = now;
        this.random = random;
        this.map = getMap(map);
        this.mode = MODES.includes(mode) ? mode : MODES[0];
        this.teamScores = this.teams ? Object.fromEntries(TEAMS.map((t) => [t, 0])) : null; // kills by team
        this.players = {};
        this.playersLimit = option(PLAYER_LIMITS, playersLimit);
        this.matchLength = option(ROOM_DURATIONS, duration) * 60; // seconds
        this.duration = this.matchLength; // seconds left
        this.ended = false;
        this.endedAt = null;
        this.votes = new Set(); // players who want a rematch
        this.rematchIn = null; // seconds until the rematch starts, once more than half want one
        this.botTarget = bots > 0 && botsCanPlay(this.map) ? Math.min(bots | 0, this.playersLimit) : 0;
        this.director = this.botTarget ? new BotDirector(this) : null;
        this.botCount = 0; // for naming new bots
    }

    /** A team match (otherwise everyone plays for themselves). */
    get teams() {
        return this.mode === 'tdm';
    }

    /** People in the room (bots aside). */
    get humans() {
        let n = 0;
        for (const id in this.players) if (!this.players[id].bot) n++;
        return n;
    }

    get isEmpty() {
        return this.humans === 0;
    }

    /** The match ended so long ago without a rematch that the room should close. */
    get expired() {
        return this.ended && this.now() - this.endedAt >= GAME_OVER_TTL_MS;
    }

    /**
     * Adds a player. `key` is the client's secret reconnect key and `profileId` their profile's id (neither is
     * ever sent to anyone else). Returns an error message for the client, or null on success.
     */
    join(id, playerName, key = null, profileId = null, bot = false) {
        if (this.players[id]) return 'Already in a room!';
        if (this.ended) return 'That match is already over.';
        // A bot makes way for a person.
        if (this.playersLimit <= Object.keys(this.players).length && (bot || !this.dropBot())) return 'That room is full.';

        this.send(id, 'joinedRoom', this.joinedRoom(id));
        const now = this.now();
        const player = {
            id,
            playerName: String(playerName || '').trim().slice(0, MAX_NAME_LENGTH) || 'Player',
            position: null,
            rotation: { x: 0, y: 0, z: 0 },
            health: MAX_HEALTH,
            deaths: 0,
            kills: 0,
            streak: 0, // kills since the last death
            bestStreak: 0,
            isDead: false,
            protectedUntil: now + SPAWN_PROTECTION,
            lastShotAt: 0,
            lastHitAt: 0,
            history: [],
            key,
            droppedAt: null,
            profileId,
            bot,
            movedAt: 0, // their last move since (re)spawning: 0 while their game is still loading
            since: now, // when they started playing this match, for the time on their profile
            reported: false, // their results for this match have gone to onResults
            team: this.teams ? this.smallerTeam() : null,
            weapon: DEFAULT_WEAPON,
            rounds: null, // magazine of each gun, by id
            medkits: 0,
            readyAt: 0, // the gun just switched to can't fire before this
            reloadAt: 0, // a reload in progress finishes then (0: none)
            healAt: 0, // a medkit in use heals then (0: none)
        };
        rearm(player);
        this.placeAtSpawn(player, this.enemyPositions(id, player.team));
        this.players[id] = player;
        pushHistory(player, now);

        // The newcomer gets the room as it is, everyone else gets the newcomer.
        this.send(id, 'currentPlayers', this.publicPlayers());
        if (this.teams) this.send(id, 'teamScores', this.teamScores);
        if (this.duration > 0) this.send(id, 'timerUpdate', this.duration);
        this.broadcast('newPlayer', publicPlayer(player, now), id);
        this.broadcastLeaderboard();
        if (bot) this.director.add(id);
        else this.fillBots();
        return null;
    }

    // Tops the match up to botTarget players with bots, or lets bots go once people fill it.
    fillBots() {
        if (!this.director || this.ended) return;
        const total = () => Object.keys(this.players).length;
        while (total() > this.botTarget && this.dropBot());
        while (total() < this.botTarget && this.humans > 0) {
            const taken = new Set(Object.values(this.players).map((p) => p.playerName));
            const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${this.botCount + 1}`;
            this.join(`bot-${++this.botCount}`, name, null, null, true);
        }
    }

    // Removes a bot (from the bigger team, in a team match). False if there's none.
    dropBot() {
        const bots = Object.values(this.players).filter((p) => p.bot);
        if (!bots.length) return false;
        let pick = bots[bots.length - 1];
        if (this.teams) {
            const count = this.teamCounts();
            const big = count.a >= count.b ? 'a' : 'b';
            pick = bots.findLast((p) => p.team === big) ?? pick;
        }
        this.leave(pick.id);
        return true;
    }

    /** Moves the bots; call every UPDATE_MS (bots/BotDirector.js) while the room has any. */
    updateBots() {
        if (this.director && !this.ended) this.director.update(this.now());
    }

    /** The player who joined with this reconnect key, if they're still in the room. */
    playerIdForKey(key) {
        if (!key) return null;
        for (const id in this.players) if (this.players[id].key === key) return id;
        return null;
    }

    /** The player's connection dropped: keep them for RECONNECT_GRACE_MS in case they come back. */
    drop(id) {
        const player = this.players[id];
        if (player) player.droppedAt = this.now();
    }

    /**
     * The player is back on a new connection: send them the room as it is now. Their magazines are filled,
     * since a reload they sent while cut off never arrived.
     */
    resume(id) {
        const player = this.players[id];
        if (!player) return;
        player.droppedAt = null;
        player.rounds = fullMagazines();
        player.reloadAt = 0;
        this.send(id, 'joinedRoom', this.joinedRoom(id));
        this.send(id, 'currentPlayers', this.publicPlayers());
        if (this.teams) this.send(id, 'teamScores', this.teamScores);
        if (this.duration > 0) this.send(id, 'timerUpdate', this.duration);
        this.send(id, 'leaderboardAllPlayers', this.publicPlayers());
        if (this.ended) {
            this.send(id, 'gameOver');
            this.send(id, 'rematchVotes', this.rematchState());
        }
    }

    leave(id) {
        const player = this.players[id];
        if (!player) return;
        if (!this.ended) this.reportResults([player], false);
        delete this.players[id];
        this.broadcast('playerDisconnected', id);
        this.broadcastLeaderboard();
        if (player.bot) this.director.remove(id);
        else this.fillBots();
        // The rematch may have been waiting on them.
        if (this.ended) this.countVotes();
    }

    // Movement: { t, p: [x, y, z], yaw, pitch, f }
    // `t` is the sender's clock; receivers use it to interpolate without jitter.
    move(id, data) {
        const player = this.players[id];
        if (!player || !data || !Array.isArray(data.p)) return;
        const [x, y, z] = data.p;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return;
        const yaw = isFiniteNumber(data.yaw) ? data.yaw : 0;
        const pitch = isFiniteNumber(data.pitch) ? data.pitch : 0;

        if (!player.isDead) {
            player.position = { x, y, z };
            player.rotation = { x: pitch, y: yaw, z: 0 };
            player.movedAt = this.now();
            pushHistory(player, this.now());
        }
        this.settle(player, this.now());

        // Volatile: a late movement packet is useless, so it's better to drop it than to queue it up.
        this.broadcast(
            'playerMoved',
            { id, t: isFiniteNumber(data.t) ? data.t : 0, p: [x, y, z], yaw, pitch, f: data.f | 0 },
            id,
            true
        );
    }

    // Shot with the gun in hand: { o: origin, d: direction, target?: playerId | null, head?: boolean, dist?: number }
    shoot(id, data) {
        const shooter = this.players[id];
        if (!shooter || shooter.isDead || this.ended || !data) return;
        if (!isVec3(data.o) || !isVec3(data.d)) return;
        // Shots start at the shooter's eyes, not anywhere they like (or on the far side of a wall).
        const eye = { x: shooter.position.x, y: shooter.position.y + EYE_HEIGHT, z: shooter.position.z };
        if (distance(data.o, eye) > MAX_ORIGIN_OFFSET || wallBetween(this.map, eye, data.o)) return;

        const now = this.now();
        this.settle(shooter, now);
        const weapon = getWeapon(shooter.weapon);
        // Not while switching, reloading or using a medkit, not faster than the gun fires, not from an empty magazine.
        if (now < shooter.readyAt || shooter.reloadAt || shooter.healAt) return;
        if (now - shooter.lastShotAt < weapon.fireInterval - FIRE_JITTER) return;
        if (shooter.rounds[weapon.id] <= 0) return;
        shooter.lastShotAt = now;

        const len = Math.hypot(data.d.x, data.d.y, data.d.z);
        if (len < 1e-6) return;
        const direction = { x: data.d.x / len, y: data.d.y / len, z: data.d.z / len };
        shooter.rounds[weapon.id] -= 1;

        // Firing gives up spawn protection.
        if (shooter.protectedUntil > now) {
            shooter.protectedUntil = 0;
            this.broadcast('protectionEnded', { id });
        }

        // Let everyone else hear/see the shot.
        this.broadcast('playerShot', { id, o: data.o, d: direction, w: weapon.id }, id);

        // The client names who it hit (null for a miss) and whether it was the head; the server checks both
        // claims, and that no wall was in the way. Older clients send no target at all, so the server looks for
        // one itself (body shots only).
        let target = null;
        let headshot = false;
        let range = 0; // how far away the target was, for damage falloff
        if (typeof data.target === 'string') {
            const candidate = this.players[data.target];
            const along = candidate && !candidate.isDead && candidate.id !== id
                ? hitDistance(data.o, direction, candidate, now)
                : null;
            if (along !== null && firstWallHit(this.map, data.o, direction, along) >= along - PLAYER_RADIUS - WALL_SLACK) {
                target = candidate;
                headshot = data.head === true && hitDistance(data.o, direction, candidate, now, true) !== null;
                range = along;
            }
        } else if (data.target === undefined) {
            const reach = Math.min(isFiniteNumber(data.dist) ? data.dist : MAX_SHOT_DISTANCE, MAX_SHOT_DISTANCE);
            target = findTarget(this.players, id, data.o, direction, firstWallHit(this.map, data.o, direction, reach));
            if (target) range = distance(data.o, target.position);
        }
        // A teammate in the way stops the bullet but takes no damage.
        if (!target || target.protectedUntil > now || this.sameTeam(target, shooter)) return;

        target.health = Math.max(0, target.health - damageAt(weapon, range, headshot));
        target.lastHitAt = now;
        this.send(target.id, 'hit', { health: target.health, from: data.o, shooter: id, headshot });
        this.send(id, 'hitConfirmed', { id: target.id, health: target.health, headshot });

        if (target.health <= 0) {
            const endedStreak = target.streak;
            target.isDead = true;
            target.deaths += 1;
            target.streak = 0;
            shooter.kills += 1;
            shooter.streak += 1;
            shooter.bestStreak = Math.max(shooter.bestStreak, shooter.streak);
            this.broadcast('playerDead', {
                id: target.id,
                shooter: id,
                playerName: target.playerName,
                shooterName: shooter.playerName,
                headshot,
                weapon: weapon.id,
                streak: shooter.streak, // the shooter's, counting this kill
                endedStreak, // the one the victim had going
                team: target.team,
                shooterTeam: shooter.team,
            });
            this.broadcast('playerKilled', { id, kills: shooter.kills });
            if (this.teams) {
                this.teamScores[shooter.team] += 1;
                this.broadcast('teamScores', this.teamScores);
            }
            this.broadcastLeaderboard();
        }
    }

    /** Switch to another gun: { w: weapon id }. It can fire once its draw time has passed. */
    switchWeapon(id, data) {
        const player = this.players[id];
        const weapon = findWeapon(data?.w);
        if (!player || !weapon || weapon.id === player.weapon) return;
        player.weapon = weapon.id;
        player.readyAt = this.now() + weapon.drawTime - TIMING_SLACK;
        // Putting the gun away stops a reload; putting the medkit away wastes it.
        player.reloadAt = 0;
        player.healAt = 0;
        this.broadcast('playerWeapon', { id, weapon: weapon.id }, id);
    }

    /** Start reloading the gun in hand. Its magazine is full once the reload time has passed. */
    reload(id) {
        const player = this.players[id];
        if (!player || player.isDead || this.ended || player.reloadAt || player.healAt) return;
        const weapon = getWeapon(player.weapon);
        const left = player.rounds[weapon.id];
        if (left >= weapon.magSize) return;
        const time = left === 0 ? weapon.reloadEmptyTime : weapon.reloadTime;
        player.reloadAt = this.now() + time - TIMING_SLACK;
    }

    /** Use the medkit: MEDKIT.heal health once MEDKIT.useTime has passed, with no shooting meanwhile. */
    heal(id) {
        const player = this.players[id];
        if (!player || player.isDead || this.ended || player.healAt) return;
        if (player.medkits <= 0 || player.health >= MAX_HEALTH) return;
        player.medkits -= 1;
        player.reloadAt = 0;
        player.healAt = this.now() + MEDKIT.useTime - TIMING_SLACK;
    }

    // Finishes the player's reload or medkit once its time has come.
    settle(player, now) {
        if (player.reloadAt && now >= player.reloadAt) {
            player.reloadAt = 0;
            player.rounds[player.weapon] = getWeapon(player.weapon).magSize;
        }
        if (player.healAt && now >= player.healAt) {
            player.healAt = 0;
            if (player.isDead || this.ended) return;
            player.health = Math.min(MAX_HEALTH, player.health + MEDKIT.heal);
            this.send(player.id, 'health', { health: player.health });
        }
    }

    respawn(id) {
        const player = this.players[id];
        if (!player || !player.isDead || this.ended) return;
        const now = this.now();
        // Coming back is the moment to even out teams that players leaving have made lopsided.
        if (this.teams) {
            const count = this.teamCounts();
            const other = TEAMS.find((t) => t !== player.team);
            if (count[player.team] - count[other] >= 2) player.team = other;
        }
        this.placeAtSpawn(player, this.enemyPositions(id, player.team));
        player.health = MAX_HEALTH;
        player.isDead = false;
        player.protectedUntil = now + SPAWN_PROTECTION;
        player.history = [];
        player.movedAt = 0;
        rearm(player);

        this.broadcast('playerRespawned', publicPlayer(player, now));
        this.broadcastLeaderboard();
    }

    /** After the match: the player wants a rematch. */
    rematch(id) {
        if (!this.ended || !this.players[id] || this.players[id].bot || this.votes.has(id)) return;
        this.votes.add(id);
        this.countVotes();
    }

    /** Call once a second: removes players who didn't come back in time, heals, counts the match down. */
    tick() {
        const now = this.now();
        for (const id in this.players) {
            const { droppedAt } = this.players[id];
            if (droppedAt !== null && now - droppedAt >= RECONNECT_GRACE_MS) this.leave(id);
            else this.settle(this.players[id], now);
        }
        if (this.ended) {
            if (this.rematchIn === null) return;
            this.rematchIn -= 1;
            if (this.rematchIn <= 0) this.startRematch();
            else this.broadcast('rematchVotes', this.rematchState());
            return;
        }

        for (const id in this.players) {
            const p = this.players[id];
            if (p.isDead || p.health >= MAX_HEALTH || now - p.lastHitAt < REGEN_DELAY_MS) continue;
            p.health = Math.min(MAX_HEALTH, p.health + REGEN_PER_TICK);
            this.send(id, 'health', { health: p.health });
        }

        this.duration -= 1;
        this.broadcast('timerUpdate', this.duration);
        if (this.duration <= 0) {
            this.ended = true;
            this.endedAt = now;
            this.broadcast('gameOver');
            this.reportResults(Object.values(this.players), true);
        }
    }

    // Everyone wants a rematch: start it now. More than half: start it in REMATCH_WAIT seconds. Bots don't vote.
    countVotes() {
        for (const id of this.votes) if (!this.players[id]) this.votes.delete(id);
        const total = this.humans;
        if (!total) return;
        if (this.votes.size === total) return this.startRematch();
        if (this.votes.size * 2 > total) this.rematchIn ??= REMATCH_WAIT;
        else this.rematchIn = null;
        this.broadcast('rematchVotes', this.rematchState());
    }

    rematchState() {
        return { votes: [...this.votes], startsIn: this.rematchIn };
    }

    // Same room, same settings, clean scores. Everyone still here plays, voted or not, on teams evened out.
    startRematch() {
        const now = this.now();
        this.ended = false;
        this.endedAt = null;
        this.votes.clear();
        this.rematchIn = null;
        this.duration = this.matchLength;
        if (this.teams) {
            for (const t of TEAMS) this.teamScores[t] = 0;
            this.balanceTeams();
        }
        const placed = []; // players already placed, to spawn away from the other team's
        for (const id in this.players) {
            const p = this.players[id];
            this.placeAtSpawn(p, placed.filter((q) => !this.sameTeam(p, q)).map((q) => q.position));
            Object.assign(p, {
                health: MAX_HEALTH,
                deaths: 0,
                kills: 0,
                streak: 0,
                bestStreak: 0,
                isDead: false,
                protectedUntil: now + SPAWN_PROTECTION,
                lastShotAt: 0,
                lastHitAt: 0,
                history: [],
                movedAt: 0,
                since: now,
                reported: false,
            });
            rearm(p);
            placed.push(p);
            pushHistory(p, now);
            if (p.bot) this.director.spawned(id);
        }
        this.broadcast('matchStarted', {
            players: this.publicPlayers(),
            duration: this.duration,
            teamScores: this.teamScores,
        });
    }

    // Hands the results of `players` who have a profile to onResults, once per match each. `finished`: the match
    // ran to its end with them in it.
    reportResults(players, finished) {
        if (!this.onResults) return;
        const now = this.now();
        const results = [];
        for (const p of players) {
            if (!p.profileId || p.reported) continue;
            p.reported = true;
            results.push({
                profileId: p.profileId,
                name: p.playerName,
                kills: p.kills,
                deaths: p.deaths,
                bestStreak: p.bestStreak,
                matches: finished ? 1 : 0,
                wins: finished && this.won(p) ? 1 : 0,
                seconds: Math.max(0, Math.round((now - p.since) / 1000)),
            });
        }
        if (results.length) this.onResults(results);
    }

    // Won the match: their team has more kills than the other, or (free-for-all) they have more than anyone else.
    won(player) {
        if (this.teams) {
            const other = TEAMS.find((t) => t !== player.team);
            return this.teamScores[player.team] > this.teamScores[other];
        }
        if (player.kills === 0) return false;
        return Object.values(this.players).every((p) => p === player || p.kills < player.kills);
    }

    // Puts the player on one of the map's spawn points, away from `enemies`, facing the way the point says
    // (or the way they were facing, if it doesn't say).
    placeAtSpawn(player, enemies) {
        const { x, y, z, yaw } = safeSpawn(this.map.spawns, enemies, this.random);
        player.position = { x, y, z };
        player.rotation = { x: 0, y: yaw ?? player.rotation.y, z: 0 };
    }

    joinedRoom(id) {
        return { message: 'Joined Room Successful!', id, map: this.map.id, mode: this.mode };
    }

    // Where the living enemies of player `id` (on `team`) are, for spawning away from them.
    enemyPositions(id, team) {
        const out = [];
        for (const other in this.players) {
            const p = this.players[other];
            if (other !== id && !p.isDead && !(team && p.team === team)) out.push(p.position);
        }
        return out;
    }

    /** Both players are on the same team (never true outside team matches). */
    sameTeam(a, b) {
        return a.team !== null && a.team === b.team;
    }

    teamCounts() {
        const count = Object.fromEntries(TEAMS.map((t) => [t, 0]));
        for (const id in this.players) count[this.players[id].team] += 1;
        return count;
    }

    // Where a newcomer goes: the team with fewer players, then the one behind on kills, then either.
    smallerTeam() {
        const count = this.teamCounts();
        const [a, b] = TEAMS;
        if (count[a] !== count[b]) return count[a] < count[b] ? a : b;
        if (this.teamScores[a] !== this.teamScores[b]) return this.teamScores[a] < this.teamScores[b] ? a : b;
        return this.random() < 0.5 ? a : b;
    }

    // Moves the latest joiners of the bigger team over until the teams are at most one apart.
    balanceTeams() {
        const [a, b] = TEAMS;
        for (;;) {
            const count = this.teamCounts();
            if (Math.abs(count[a] - count[b]) < 2) return;
            const from = count[a] > count[b] ? a : b;
            const last = Object.values(this.players).findLast((p) => p.team === from);
            last.team = from === a ? b : a;
        }
    }

    publicPlayers() {
        const now = this.now();
        const out = {};
        for (const id in this.players) out[id] = publicPlayer(this.players[id], now);
        return out;
    }

    broadcast(event, data, exceptId = null, volatile = false) {
        for (const id in this.players) {
            if (id !== exceptId) this.send(id, event, data, volatile);
        }
    }

    broadcastLeaderboard() {
        this.broadcast('leaderboardAllPlayers', this.publicPlayers());
    }
}
