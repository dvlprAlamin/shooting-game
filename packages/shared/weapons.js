// The guns everyone carries, and the medkit. Both sides read this table: the server for the rules (damage,
// fire rate, magazine, reload and switch times), the client for those and for handling (spread, recoil,
// speed, sights). Imported as `@rimfire/shared/weapons`. Types: weapons.d.ts.
//
// Times are in ms, distances in m, angles in radians.

/**
 * - `damage` / `headDamage`: per hit, at full strength.
 * - `falloff`: [from, to, least]: full damage up to `from` metres, falling to `least` times that at `to` and
 *   beyond. null: the same at any range.
 * - `fireInterval`: least time between shots. `auto`: holding the trigger keeps firing.
 * - `reloadTime` with rounds left, `reloadEmptyTime` from empty. `drawTime`: switching to it.
 * - `spread`: how far a shot may stray, standing / moving / in the air / aiming.
 * - `recoil`: camera kick per shot, up (plus up to `kickRandom` more) and sideways (either way, up to `yaw`).
 * - `speed`: movement multiplier while holding it. `aimFov`: field of view while aiming. `scope`: aiming
 *   looks through a scope (the gun leaves the screen).
 */
export const WEAPONS = [
    {
        id: 'rifle',
        name: 'Rifle',
        damage: 10,
        headDamage: 25,
        falloff: [45, 90, 0.7],
        fireInterval: 100, // 600 rpm
        auto: true,
        magSize: 30,
        reloadTime: 2400,
        reloadEmptyTime: 3200,
        drawTime: 600,
        spread: { stand: 0.006, move: 0.022, air: 0.05, aim: 0 },
        recoil: { kick: 0.0045, kickRandom: 0.003, yaw: 0.004 },
        speed: 1,
        aimFov: 45,
    },
    {
        id: 'smg',
        name: 'SMG',
        damage: 8,
        headDamage: 18,
        falloff: [15, 40, 0.55],
        fireInterval: 70, // ~860 rpm
        auto: true,
        magSize: 32,
        reloadTime: 2100,
        reloadEmptyTime: 2800,
        drawTime: 500,
        spread: { stand: 0.01, move: 0.016, air: 0.04, aim: 0.004 },
        recoil: { kick: 0.0032, kickRandom: 0.002, yaw: 0.005 },
        speed: 1.08,
        aimFov: 48,
    },
    {
        id: 'marksman',
        name: 'Marksman',
        damage: 40,
        headDamage: 100,
        falloff: null,
        fireInterval: 300,
        auto: false,
        magSize: 10,
        reloadTime: 2600,
        reloadEmptyTime: 3400,
        drawTime: 700,
        spread: { stand: 0.04, move: 0.06, air: 0.1, aim: 0 },
        recoil: { kick: 0.022, kickRandom: 0.006, yaw: 0.004 },
        speed: 0.92,
        aimFov: 18,
        scope: true,
    },
    {
        id: 'pistol',
        name: 'Pistol',
        damage: 15,
        headDamage: 35,
        falloff: [20, 50, 0.6],
        fireInterval: 150,
        auto: false,
        magSize: 12,
        reloadTime: 1500,
        reloadEmptyTime: 1800,
        drawTime: 400,
        spread: { stand: 0.008, move: 0.016, air: 0.04, aim: 0 },
        recoil: { kick: 0.011, kickRandom: 0.004, yaw: 0.004 },
        speed: 1.1,
        aimFov: 50,
    },
];

export const DEFAULT_WEAPON = WEAPONS[0].id;

/** The weapon with this id, or undefined. */
export const findWeapon = (id) => WEAPONS.find((w) => w.id === id);

/** The weapon with this id, or the default one. */
export const getWeapon = (id) => findWeapon(id) ?? WEAPONS[0];

/** Damage of one hit `distance` metres away, as a whole number. */
export const damageAt = (weapon, distance, head = false) => {
    const full = head ? weapon.headDamage : weapon.damage;
    if (!weapon.falloff) return full;
    const [from, to, least] = weapon.falloff;
    const t = Math.min(1, Math.max(0, (distance - from) / (to - from)));
    return Math.round(full * (1 - t * (1 - least)));
};

// The medkit: one per life, `useTime` to apply (no shooting meanwhile), then `heal` health.
export const MEDKIT = { heal: 50, useTime: 2000, perLife: 1 };
