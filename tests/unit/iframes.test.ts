import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TUNING } from '@/game/tuning';
import { createHarness, type Harness } from './harness';

/** Drops a pedestrian right on top of the player, guaranteeing a collision. */
function spawnOnPlayer(h: Harness, id: number): void {
  const { player, entities } = h.inner;
  entities.push({
    id,
    kind: 'pedestrian',
    lane: player.lane,
    x: player.laneX,
    y: player.y,
    dead: false,
    engaged: false,
    knockback: null,
  });
}

describe('post-hit invulnerability', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness(555);
  });
  afterEach(() => h.destroy());

  it('ignores every further collision for IFRAME_MS after a hit', () => {
    spawnOnPlayer(h, 9001);
    h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);

    // Hammer the player with obstacles for the whole i-frame window.
    let id = 9100;
    const start = h.elapsed;
    while (h.elapsed - start < TUNING.IFRAME_MS - TUNING.FIXED_DT) {
      spawnOnPlayer(h, (id += 1));
      h.step();
      expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);
    }
    expect(h.game.phase).not.toBe('gameover');
  });

  it('takes damage again once the window has closed', () => {
    spawnOnPlayer(h, 1);
    h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);

    const start = h.elapsed;
    while (h.elapsed - start <= TUNING.IFRAME_MS) h.step();

    spawnOnPlayer(h, 2);
    h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 2);
  });

  it('never chains a full 3 -> 0 wipe from a single pile-up', () => {
    for (let i = 0; i < 40; i += 1) {
      spawnOnPlayer(h, 5000 + i);
      h.step();
    }
    // 40 frames ~= 667ms, comfortably inside one i-frame window.
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);
    expect(h.game.phase).not.toBe('gameover');
  });
});

describe('bumper window expiry', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness(31);
  });
  afterEach(() => h.destroy());

  it('an untapped counter window costs one hp and then grants i-frames', () => {
    const { player, entities } = h.inner;
    entities.push({
      id: 1,
      kind: 'bumper',
      lane: player.lane,
      x: player.laneX,
      y: player.y - TUNING.SLOWMO_TRIGGER_DIST + 20,
      dead: false,
      engaged: false,
      knockback: null,
    });
    // Never tap: engage -> window expires -> miss.
    while (h.inner.score.hp === TUNING.HP_MAX && h.elapsed < 10_000) h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);

    // The miss must arm i-frames exactly like a collision does.
    const start = h.elapsed;
    let id = 700;
    while (h.elapsed - start < TUNING.IFRAME_MS - TUNING.FIXED_DT * 2) {
      spawnOnPlayer(h, (id += 1));
      h.step();
    }
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);
  });
});
