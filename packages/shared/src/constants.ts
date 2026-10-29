export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-zA-Z0-9]+$/;

export const PASSWORD_MIN_LENGTH = 8;
/** Caps hashing cost per request and stays well under argon2/bcrypt input limits. */
export const PASSWORD_MAX_LENGTH = 128;

export const MIN_TARGET_SCORE = 10;
export const MAX_TARGET_SCORE = 1000;
export const DEFAULT_TARGET_SCORE = 100;

export const DIE_MIN_FACE = 1;
export const DIE_MAX_FACE = 6;

/** Username of the built-in AI opponent; reserved so no human account can claim it. */
export const AI_PLAYER_USERNAME = 'RoboRoller';
