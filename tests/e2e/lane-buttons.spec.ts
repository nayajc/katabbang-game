import { expect, test, type Locator, type Page } from '@playwright/test';

// Mirrors src/game/tuning.ts + the lane button constants in src/game/render.ts.
const VIRTUAL_W = 540;
const VIRTUAL_H = 960;
const LEFT_BUTTON = { x: 86, y: VIRTUAL_H - 200 };
const RIGHT_BUTTON = { x: VIRTUAL_W - 86, y: VIRTUAL_H - 200 };

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
  if (await page.evaluate(() => 'ontouchstart' in window)) {
    await page.touchscreen.tap(p.x, p.y);
  } else {
    await page.mouse.click(p.x, p.y);
  }
}

/** Where a virtual point is actually DRAWN, using render()'s backing-store math. */
async function drawnToClient(canvas: Locator, vx: number, vy: number) {
  return canvas.evaluate(
    (el, { vx, vy, VW, VH }) => {
      const c = el as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const s = Math.min(c.width / VW, c.height / VH);
      const dx = (c.width - VW * s) / 2 + vx * s;
      const dy = (c.height - VH * s) / 2 + vy * s;
      return { x: r.left + dx * (r.width / c.width), y: r.top + dy * (r.height / c.height) };
    },
    { vx, vy, VW: VIRTUAL_W, VH: VIRTUAL_H },
  );
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

test('lane buttons stay tappable after the viewport box changes (iOS browser chrome)', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  // iOS collapses/expands its chrome, which resizes the 100dvh stage. If the
  // canvas backing store does not follow, the drawn buttons drift away from
  // their hit boxes and taps land on nothing.
  await page.evaluate(() => {
    (document.querySelector('[data-phase]') as HTMLElement).style.height = '460px';
  });
  await expect
    .poll(async () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.round((c.width / c.height) * 1000);
      }),
    )
    .toBe(
      await canvas.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return Math.round((r.width / r.height) * 1000);
      }),
    );

  // Tap where the button is DRAWN, not where the hit box is assumed to be.
  const p = await drawnToClient(canvas, RIGHT_BUTTON.x, RIGHT_BUTTON.y);
  if (await page.evaluate(() => 'ontouchstart' in window)) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
});

test('a cancelled pointer gesture does not deafen subsequent input', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  // iOS frequently ends a touch with `pointercancel` (system gesture, browser
  // chrome). A stale pointerId used to block every later pointerdown forever.
  const p = await virtualToClient(canvas, RIGHT_BUTTON.x, RIGHT_BUTTON.y);
  await canvas.evaluate(
    (el, { x, y }) => {
      const base = {
        pointerId: 999,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      };
      el.dispatchEvent(new PointerEvent('pointerdown', base));
      el.dispatchEvent(new PointerEvent('pointercancel', base));
    },
    { x: p.x, y: p.y },
  );

  // Input must still work afterwards.
  await tapVirtual(page, canvas, RIGHT_BUTTON.x, RIGHT_BUTTON.y);
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
});
