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
  /** Peak body lean (radians) into the direction of a lane change. */
  LANE_LEAN_RAD: 0.22,

  // --- speed / difficulty ---
  /** Base world scroll speed, vu per second of simulated time. */
  BASE_SPEED: 420,
  SPEED_PER_SEC: 6,
  MAX_SPEED: 900,
  /** Distance score units per vu scrolled. */
  DISTANCE_PER_VU: 0.05,

  // --- spawning (seeded) ---
  /**
   * Opening grace: simulated ms at the head of a run during which NOTHING
   * spawns, so the player can feel the controls before the road fills up.
   */
  SPAWN_GRACE_MS: 2500,
  /**
   * Simulated ms after the grace period over which difficulty ramps from its
   * opening values to full. Density and bumper frequency both use this ramp.
   */
  DIFFICULTY_RAMP_MS: 38_000,
  /** Simulated ms between spawn attempts: sparse opening -> full-difficulty floor. */
  SPAWN_INTERVAL_START: 1500,
  SPAWN_INTERVAL_MIN: 460,
  /** Probability that a spawn is a bumper (어깨빵 시전자) rather than a pedestrian. */
  BUMPER_CHANCE_START: 0.1,
  BUMPER_CHANCE: 0.32,
  /**
   * Minimum simulated ms between two bumper spawns at the start of a run,
   * decaying to zero across the ramp. Stops back-to-back counter windows from
   * stacking before the player has learned the timing.
   */
  BUMPER_MIN_GAP_MS: 4000,

  // --- counter / slowmo ---
  /** Simulation timescale while in slow motion. */
  SLOWMO_TIMESCALE: 0.3,
  /**
   * Distance (vu) ahead of the player at which slowmo engages. MUST stay below
   * the distance at which a player can first read and react to an obstacle
   * (~300vu), otherwise a bumper commits the player to a counter window before
   * dodging into a free lane was ever an option.
   */
  SLOWMO_TRIGGER_DIST: 280,
  /**
   * Centre-to-centre gap (vu) at which the bumper VISUALLY reaches the player —
   * i.e. the moment the two bodies touch. MUST equal PLAYER_R + ENTITY_R.
   * The counter window centres here, not on gap === 0 (fully overlapped sprites).
   */
  COUNTER_IMPACT_GAP: 34 + 32,
  /** Wall-clock lead (ms) over which the approach ring shrinks onto the target. */
  COUNTER_CUE_LEAD_MS: 900,
  /** Wall-clock judgement windows (ms). */
  PERFECT_MS: 130,
  GOOD_MS: 350,
  /** Extra wall-clock grace after the window closes before declaring a miss. */
  MISS_GRACE_MS: 60,
  /** Wall-clock hitstop after a successful counter. */
  HITSTOP_MS: 90,
  /** Wall-clock duration of the result banner. */
  RESULT_MS: 620,
  /**
   * Wall-clock length of the WHIFF reaction — the light jab the player throws
   * when the counter input is pressed with no window armed. Presentation only:
   * it costs no hp, no score and no cooldown, and the simulation never reads it.
   * Deliberately much shorter than the 520ms uppercut so the two never read as
   * the same move.
   */
  WHIFF_MS: 250,

  // --- scoring / hp ---
  HP_MAX: 3,
  /**
   * Wall-clock invulnerability after ANY hp loss. Collisions are ignored and no
   * new counter window arms, so one mistake can never chain 3 -> 0.
   */
  IFRAME_MS: 1200,
  /** Wall-clock duration of the red hit flash / hp heart flash. */
  HIT_FLASH_MS: 420,
  /** Screen shake amplitude on hp loss (stronger than a counter whiff). */
  HIT_SHAKE: 22,
  /** Blink period (wall-clock ms) of the player sprite during i-frames. */
  IFRAME_BLINK_MS: 130,
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
