import { expect, test } from '@playwright/test';

// Mirrors src/game/tuning.ts.
const VIRTUAL_W = 540;
const VIRTUAL_H = 960;
const PLAYER_Y = 760;
const PLAYER_R = 34;

/**
 * Reads back the topmost bright (sprite) pixel row inside the player's box.
 *
 * The road is dark (#191d2e / #2c3350), so a luminance threshold isolates the
 * character from the scrolling background — which means a changing value can
 * only come from the character moving, not from the road passing behind it.
 */
async function playerTopRow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    ({ vw, vh, py, pr }) => {
      const el = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')!;
      const ctx = el.getContext('2d')!;
      const scale = Math.min(el.width / vw, el.height / vh);
      const offX = (el.width - vw * scale) / 2;
      const offY = (el.height - vh * scale) / 2;
      const toX = (x: number) => Math.round(offX + x * scale);
      const toY = (y: number) => Math.round(offY + y * scale);

      const x0 = toX(vw / 2 - pr * 1.6);
      const x1 = toX(vw / 2 + pr * 1.6);
      const y0 = toY(py - pr * 2.4);
      const y1 = toY(py + pr * 1.2);
      const w = x1 - x0;
      const h = y1 - y0;
      const data = ctx.getImageData(x0, y0, w, h).data;

      for (let row = 0; row < h; row += 1) {
        for (let col = 0; col < w; col += 1) {
          const i = (row * w + col) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (data[i + 3] > 200 && lum > 130) return row;
        }
      }
      return -1;
    },
    { vw: VIRTUAL_W, vh: VIRTUAL_H, py: PLAYER_Y, pr: PLAYER_R },
  );
}

test('the player is visibly animated while running', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  const samples: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    samples.push(await playerTopRow(page));
    await page.waitForTimeout(150);
  }

  // The character was found at all (not a blank canvas / all-dark readback).
  expect(samples.every((s) => s >= 0)).toBe(true);
  // Its silhouette moved between captures — the run cycle is visible.
  expect(new Set(samples).size).toBeGreaterThan(1);
});
