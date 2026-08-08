/**
 * ALL gameplay tuning constants live here (plan: "튜닝 상수는 한 파일에 집중").
 * Times are in milliseconds unless noted. Distances are in virtual units (vu),
 * where the virtual play field is VIRTUAL_W x VIRTUAL_H and is letterboxed to
 * the real canvas.
 */
export const TUNING = {
  // --- loop ---
  /** Fixed simulation step (ms of simulated time). */
  FIXED_DT: 1000 / 60,
  /** Clamp for a single rAF delta so tab-switch spikes cannot explode the sim. */
  MAX_DELTA: 250,
  /** Max fixed steps consumed per frame (spiral-of-death guard). */
  MAX_STEPS_PER_FRAME: 5,

  // --- field ---
  VIRTUAL_W: 540,
  VIRTUAL_H: 960,
  LANES: 3,
  LANE_X: [150, 270, 390] as const,
  PLAYER_Y: 760,
  PLAYER_R: 34,
  ENTITY_R: 32,
  /** Lane change duration (ms of simulated time). */
  LANE_CHANGE_MS: 120,

  // --- speed / difficulty ---
  /** Base world scroll speed, vu per second of simulated time. */
  BASE_SPEED: 420,
  SPEED_PER_SEC: 6,
  MAX_SPEED: 900,
  /** Distance score units per vu scrolled. */
  DISTANCE_PER_VU: 0.05,

  // --- spawning (seeded) ---
  /** Seconds of simulated time between spawn attempts, start and floor. */
  SPAWN_INTERVAL_START: 900,
  SPAWN_INTERVAL_MIN: 420,
  SPAWN_INTERVAL_DECAY: 0.985,
  /** Probability that a spawn is a bumper (어깨빵 시전자) rather than a pedestrian. */
  BUMPER_CHANCE: 0.32,

  // --- counter / slowmo ---
  /** Simulation timescale while in slow motion. */
  SLOWMO_TIMESCALE: 0.3,
  /** Distance (vu) ahead of the player at which slowmo engages. */
  SLOWMO_TRIGGER_DIST: 320,
  /** Wall-clock judgement windows (ms). */
  PERFECT_MS: 60,
  GOOD_MS: 140,
  /** Extra wall-clock grace after the window closes before declaring a miss. */
  MISS_GRACE_MS: 60,
  /** Wall-clock hitstop after a successful counter. */
  HITSTOP_MS: 90,
  /** Wall-clock duration of the result banner. */
  RESULT_MS: 620,

  // --- scoring / hp ---
  HP_MAX: 3,
  COUNTER_BONUS: 300,
  /** Combo multiplier = 1 + combo * COMBO_STEP, capped. */
  COMBO_STEP: 0.25,
  COMBO_MAX_MULT: 4,
  JUSTICE_PERFECT: 3,
  JUSTICE_GOOD: 1,
  GOOD_SCORE_RATIO: 0.5,

  // --- render ---
  MAX_DPR: 2,
} as const;

export type Tuning = typeof TUNING;
