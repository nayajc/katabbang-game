import { describe, expect, it } from 'vitest';
import { CounterWindow, simMsToTravel } from '@/game/counter';
import { TUNING } from '@/game/tuning';
import type { Entity } from '@/game/entities/spawner';

/**
 * Impact-alignment harness.
 *
 * Replays the REAL timeline — Engine's fixed-timestep accumulator, Game's entity
 * motion and slowmo entry, CounterWindow's arming — and measures the wall-clock
 * moment at which the bumper VISUALLY touches the player against the armed
 * `windowCenterTs`. Any systematic offset here is exactly the offset a human
 * feels when they tap on the visible impact.
 */

const bumper = (): Entity => ({
  id: 1,
  kind: 'bumper',
  lane: 1,
  x: TUNING.LANE_X[1],
  y: -TUNING.ENTITY_R * 2,
  dead: false,
  engaged: false,
  knockback: null,
});

type Sample = { offsetMs: number; centerTs: number };

/** @param legacy replay the pre-fix math (centre on gap 0, ignore the accumulator). */
function replay(startSpeed: number, frameMs: number, legacy = false): Sample {
  const e = bumper();
  const w = new CounterWindow();
  let speed = startSpeed;
  let wall = 0;
  let acc = 0;
  let armed = false;

  for (let frame = 0; frame < 5000; frame += 1) {
    // Engine.frame(): timescale is sampled once per frame, before stepping.
    acc += frameMs * (armed ? TUNING.SLOWMO_TIMESCALE : 1);

    let steps = 0;
    while (acc >= TUNING.FIXED_DT && steps < TUNING.MAX_STEPS_PER_FRAME) {
      const secs = TUNING.FIXED_DT / 1000;
      speed = Math.min(TUNING.MAX_SPEED, speed + TUNING.SPEED_PER_SEC * secs);
      e.y += speed * secs;
      acc -= TUNING.FIXED_DT;
      steps += 1;

      // Game.checkBumperEngage(), which runs after motion within the same step.
      const gap = TUNING.PLAYER_Y - e.y;
      if (!armed && gap > 0 && gap <= TUNING.SLOWMO_TRIGGER_DIST) {
        if (legacy) {
          w.arm(e, (gap / speed) * 1000, wall);
          armed = true;
        } else {
          const travel = gap - TUNING.COUNTER_IMPACT_GAP;
          if (travel > 0) {
            w.arm(e, simMsToTravel(travel, speed), wall, acc);
            armed = true;
          }
        }
      }
    }
    if (steps === TUNING.MAX_STEPS_PER_FRAME) acc = 0;

    // Game.draw() renders the post-step positions at this wall time: what the
    // player actually sees. Contact = the two bodies touching.
    if (armed && TUNING.PLAYER_Y - e.y <= TUNING.COUNTER_IMPACT_GAP) {
      return { offsetMs: wall - w.windowCenterTs, centerTs: w.windowCenterTs };
    }
    wall += frameMs;
  }
  throw new Error('bumper never reached the player');
}

const FRAME_RATES = [30, 45, 60, 90, 120];
const SPEEDS = [TUNING.BASE_SPEED, 500, 600, 750, TUNING.MAX_SPEED];

describe('counter window aligns with the visual impact', () => {
  for (const fps of FRAME_RATES) {
    for (const speed of SPEEDS) {
      it(`is within the perfect window at ${fps}fps / ${speed}vu/s`, () => {
        const { offsetMs } = replay(speed, 1000 / fps);
        // Residual is pure frame/step quantization (~1 frame + half a sim step)
        // and is always LATE, never the huge early miss of the old math.
        expect(Math.abs(offsetMs)).toBeLessThanOrEqual(TUNING.PERFECT_MS);
      });
    }
  }

  it('regression: the old math centred hundreds of ms after the visible impact', () => {
    const legacy = replay(TUNING.BASE_SPEED, 1000 / 60, true);
    const fixed = replay(TUNING.BASE_SPEED, 1000 / 60);
    // Old behaviour: tapping on the visible impact was ~0.5s EARLY -> always miss.
    expect(legacy.offsetMs).toBeLessThan(-TUNING.GOOD_MS);
    expect(Math.abs(fixed.offsetMs)).toBeLessThan(Math.abs(legacy.offsetMs));
  });

  it('the window centre is reachable: tapping at the visible impact grades at least good', () => {
    for (const fps of FRAME_RATES) {
      for (const speed of SPEEDS) {
        const { offsetMs } = replay(speed, 1000 / fps);
        expect(Math.abs(offsetMs), `${fps}fps/${speed}`).toBeLessThanOrEqual(TUNING.GOOD_MS);
      }
    }
  });
});

describe('simMsToTravel()', () => {
  it('accounts for the speed ramp (arrives sooner than a constant-speed guess)', () => {
    const dist = 300;
    const speed = TUNING.BASE_SPEED;
    expect(simMsToTravel(dist, speed)).toBeLessThan((dist / speed) * 1000);
  });

  it('falls back to constant speed at the speed cap', () => {
    expect(simMsToTravel(300, TUNING.MAX_SPEED)).toBeCloseTo((300 / TUNING.MAX_SPEED) * 1000, 6);
  });

  it('is zero for a non-positive distance', () => {
    expect(simMsToTravel(0, TUNING.BASE_SPEED)).toBe(0);
    expect(simMsToTravel(-10, TUNING.BASE_SPEED)).toBe(0);
  });

  it('COUNTER_IMPACT_GAP is the touching distance', () => {
    expect(TUNING.COUNTER_IMPACT_GAP).toBe(TUNING.PLAYER_R + TUNING.ENTITY_R);
  });
});
