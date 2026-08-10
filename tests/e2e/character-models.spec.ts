import { expect, test, type Page } from '@playwright/test';

/**
 * Progressive character upgrade.
 *
 * The rigged glTF characters are a **presentation upgrade layered on a working
 * game**: the run starts on the procedural box rig with no network dependency,
 * and the models swap in from a background fetch. That makes two things testable
 * and both of them matter more than how the characters look:
 *
 * 1. The models are actually requested and actually applied.
 * 2. If the fetch never lands, the run is indistinguishable from before — same
 *    playable game, same data contracts, and nothing on the console.
 */

/** Pixels in the player's box whose colour comes from a character, not the road. */
async function characterPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')!;
    const off = document.createElement('canvas');
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(gl, 0, 0);
    const x0 = Math.round(gl.width * 0.3);
    const y0 = Math.round(gl.height * 0.5);
    const w = Math.round(gl.width * 0.4);
    const h = Math.round(gl.height * 0.42);
    const data = ctx.getImageData(x0, y0, w, h).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Warm: the shirt and skin. The road, dashes and skyline are all cool blue.
      if (data[i + 3] > 200 && data[i] > 120 && data[i] - data[i + 2] > 40) n += 1;
    }
    return n;
  });
}

test('the rigged models are fetched and swapped in', async ({ page }) => {
  const models: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/models/') && r.url().endsWith('.glb')) models.push(r.url());
  });

  await page.goto('/play?debug=1');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-player-lane', '1');

  // The fetch is lazy and parallel; give it room on a cold cache.
  await expect(async () => expect(models.length).toBeGreaterThanOrEqual(3)).toPass({
    timeout: 15_000,
  });
  expect(models.every((u) => /\/(man|woman|casual)\.glb$/.test(u))).toBe(true);

  // A skinned character is on screen and still animating after the swap.
  await page.waitForTimeout(1500);
  const samples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    samples.push(await characterPixels(page));
    await page.waitForTimeout(140);
  }
  expect(samples.every((n) => n > 100)).toBe(true);
  expect(new Set(samples).size).toBeGreaterThan(1);
});

test('a failed model fetch leaves a playable run and a clean console', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  // Every model 404s, i.e. the worst case: a deploy that shipped the JS but not
  // the assets.
  await page.route('**/models/*.glb', (route) => route.abort());

  await page.goto('/play?debug=1');
  await page.getByTestId('start-button').click();
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toHaveAttribute('data-player-lane', '1');
  await page.waitForTimeout(2500);

  // Still rendering a character (the box rig), and the phase contract holds.
  expect(await characterPixels(page)).toBeGreaterThan(100);
  await expect(page.locator('[data-phase]')).toHaveAttribute('data-phase', /running|slowmo|result/);
  // Aborted requests are expected, and `characterPixels` provokes a GL driver
  // stall warning by reading the buffer back. Anything the app itself logged is
  // not expected.
  const appProblems = problems.filter(
    (p) => !/net::ERR|Failed to load resource|GL Driver Message/.test(p),
  );
  expect(appProblems).toEqual([]);
});
