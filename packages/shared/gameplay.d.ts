// Types for gameplay.js, for the TypeScript files in the client. Keep in step with gameplay.js.
export declare const PLAYER_RADIUS: number;
export declare const PLAYER_HALF_HEIGHT: number;
export declare const PLAYER_CENTER_TO_FEET: number;
export declare const EYE_HEIGHT: number;
export declare const MAX_HEALTH: number;
export declare const SPAWN_PROTECTION: number;
export declare const HEAD_HEIGHT: number;
export declare const MAX_SHOT_DISTANCE: number;
export type Mode = 'ffa' | 'tdm';
export type Team = 'a' | 'b';
export declare const MODES: Mode[];
export declare const TEAMS: Team[];
export declare const ROOM_DURATIONS: number[];
export declare const PLAYER_LIMITS: number[];
export declare const ROOM_ID_PATTERN: RegExp;
