import { expect, test } from '@playwright/test';

/**
 * Reads back the topmost row of PLAYER-coloured pixels in the middle of the
 * frame.
 *
 * The player wears a warm yellow shirt (#ffe066) over warm skin; the road, the
 * lane dashes and the skyline are all cool blues. A "warm" colour test
 * therefore isolates the character from everything behind it, so a changing
 * value can only come from the character moving.
 *
 * The scene is WebGL now, so the buffer is sampled by compositing the canvas
 * into a 2D canvas. That needs `preserveDrawingBuffer`, which the renderer only
 * enables under `?debug=1` — it costs bandwidth on real phones.
 */
async function playerTopRow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')!;
    const off = document.createElement('canvas');
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(gl, 0, 0);

    // Box around the player: it runs down the middle of the lower half.
    const x0 = Math.round(gl.width * 0.34);
    const x1 = Math.round(gl.width * 0.66);
    const y0 = Math.round(gl.height * 0.5);
    const y1 = Math.round(gl.height * 0.92);
    const w = x1 - x0;
    const h = y1 - y0;
    const data = ctx.getImageData(x0, y0, w, h).data;

    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < w; col += 1) {
        const i = (row * w + col) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Warm and bright: the shirt / skin. Everything else in frame is cool.
        if (data[i + 3] > 200 && r > 150 && r - b > 45 && g - b > 20) return row;
      }
    }
    return -1;
  });
}

test('the player is visibly animated while running', async ({ page }) => {
  await page.goto('/play?debug=1');
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

test('the world is rendered in perspective, not as a flat 2D field', async ({ page }) => {
  await page.goto('/play?debug=1');
  await page.getByTestId('start-button').click();
  await page.waitForTimeout(600);

  // A receding road narrows with distance: the lit road surface must span far
  // fewer pixels near the horizon than it does near the camera.
  const widths = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')!;
    const off = document.createElement('canvas');
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(gl, 0, 0);

    /** Pixels in a row that are road-surface bright (vs the darker surroundings). */
    const rowWidth = (yFrac: number) => {
      const y = Math.round(gl.height * yFrac);
      const data = ctx.getImageData(0, y, gl.width, 1).data;
      let n = 0;
      for (let x = 0; x < gl.width; x += 1) {
        const i = x * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum > 70) n += 1;
      }
      return n;
    };
    return { far: rowWidth(0.45), near: rowWidth(0.95) };
  });

  expect(widths.near).toBeGreaterThan(0);
  expect(widths.near).toBeGreaterThan(widths.far * 1.4);
});
