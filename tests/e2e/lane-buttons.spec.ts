import { expect, test, type Locator, type Page } from '@playwright/test';

// Mirrors src/game/tuning.ts + the lane button constants in src/game/render.ts.
const VIRTUAL_W = 540;
const VIRTUAL_H = 960;
const LEFT_BUTTON = { x: 86, y: VIRTUAL_H - 112 };
const RIGHT_BUTTON = { x: VIRTUAL_W - 86, y: VIRTUAL_H - 112 };

/** Virtual units -> client px, using the same letterbox math as screenToVirtual(). */
async function virtualToClient(canvas: Locator, vx: number, vy: number) {
  const rect = await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const scale = Math.min(rect.width / VIRTUAL_W, rect.height / VIRTUAL_H);
  const offX = (rect.width - VIRTUAL_W * scale) / 2;
  const offY = (rect.height - VIRTUAL_H * scale) / 2;
  return { x: rect.left + offX + vx * scale, y: rect.top + offY + vy * scale };
}

async function tapVirtual(page: Page, canvas: Locator, vx: number, vy: number) {
  const p = await virtualToClient(canvas, vx, vy);
  await page.mouse.click(p.x, p.y);
}

function lane(canvas: Locator) {
  return canvas.evaluate((el) => (el as HTMLCanvasElement).dataset.playerLane);
}

test('lane buttons move the player during running', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  await tapVirtual(page, canvas, RIGHT_BUTTON.x, RIGHT_BUTTON.y);
  await expect(canvas).toHaveAttribute('data-player-lane', '2');

  await tapVirtual(page, canvas, LEFT_BUTTON.x, LEFT_BUTTON.y);
  await tapVirtual(page, canvas, LEFT_BUTTON.x, LEFT_BUTTON.y);
  await expect(canvas).toHaveAttribute('data-player-lane', '0');

  // Keyboard control still works alongside the buttons.
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-player-lane', '1');
});

test('a lane button tap during slowmo does not count as a counter tap', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const stage = page.locator('[data-phase]');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();

  // Bumpers only engage in the player's lane, and the idle player can run out of
  // HP on pedestrians first — so retry runs until one bumper engages.
  const deadline = Date.now() + 60_000;
  let phase = await stage.getAttribute('data-phase');
  while (phase !== 'slowmo' && Date.now() < deadline) {
    if (phase === 'gameover') await page.getByTestId('retry-button').click();
    await page.waitForTimeout(50);
    phase = await stage.getAttribute('data-phase');
  }
  expect(phase).toBe('slowmo');
  const before = await lane(canvas);

  // A counter tap would resolve the window and flip the phase to 'result';
  // a lane button tap must only move the player.
  const target = before === '0' ? RIGHT_BUTTON : LEFT_BUTTON;
  await tapVirtual(page, canvas, target.x, target.y);

  expect(await stage.getAttribute('data-phase')).toBe('slowmo');
  expect(await lane(canvas)).not.toBe(before);
});
