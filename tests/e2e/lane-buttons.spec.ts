import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Lane controls.
 *
 * They used to be drawn INSIDE the canvas and hit-tested in virtual units, so
 * these tests had to mirror the letterbox math. With the 3D presentation they
 * are real DOM buttons layered over the canvas — which also means a lane press
 * can no longer reach the canvas input listeners at all, and so can never be
 * read as a counter tap.
 */

/** Press a control the way the device would: touch on mobile, mouse on desktop. */
async function press(page: Page, control: Locator) {
  if (await page.evaluate(() => 'ontouchstart' in window)) await control.tap();
  else await control.click();
}

function lane(canvas: Locator) {
  return canvas.evaluate((el) => (el as HTMLCanvasElement).dataset.playerLane);
}

test('lane buttons move the player during running', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  await press(page, page.getByTestId('lane-right'));
  await expect(canvas).toHaveAttribute('data-player-lane', '2');

  await press(page, page.getByTestId('lane-left'));
  await press(page, page.getByTestId('lane-left'));
  await expect(canvas).toHaveAttribute('data-player-lane', '0');

  // Keyboard control still works alongside the buttons.
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-player-lane', '1');
});

test('the lane buttons are absent on the title screen and return for a run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('lane-left')).toHaveCount(0);
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('lane-left')).toBeVisible();
  await expect(page.getByTestId('lane-right')).toBeVisible();
});

test('a lane button tap during slowmo does not count as a counter tap', async ({ page }) => {
  // Reaching a bumper encounter is spawn-RNG bound: an idle run needs anywhere
  // from ~10s to ~60s of retries before one engages in the player's lane.
  test.setTimeout(220_000);
  await page.goto('/');
  const stage = page.locator('[data-phase]');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();

  // Bumpers only engage in the player's lane, and the idle player can run out of
  // HP on pedestrians first — so retry runs until one bumper engages.
  const deadline = Date.now() + 170_000;
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
  await press(page, page.getByTestId(before === '0' ? 'lane-right' : 'lane-left'));

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

  // iOS collapses/expands its chrome, which resizes the stage. The buttons are
  // laid out by CSS now, but the drawing buffer must still follow the CSS box
  // or the perspective stretches.
  await page.evaluate(() => {
    (document.querySelector('[data-phase]') as HTMLElement).style.height = '460px';
  });
  await expect
    .poll(async () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.round((c.width / c.height) * 100);
      }),
    )
    .toBe(
      await canvas.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return Math.round((r.width / r.height) * 100);
      }),
    );

  await press(page, page.getByTestId('lane-right'));
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
});

test('a cancelled pointer gesture does not deafen subsequent input', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  // iOS frequently ends a touch with `pointercancel` (system gesture, browser
  // chrome). A stale pointerId used to block every later pointerdown forever.
  await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const base = {
      pointerId: 999,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', base));
    el.dispatchEvent(new PointerEvent('pointercancel', base));
  });

  // Input must still work afterwards.
  await press(page, page.getByTestId('lane-right'));
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
});

test('the mute button toggles audio without touching the run', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  const mute = page.getByTestId('mute-button');
  await expect(mute).toHaveAttribute('data-muted', '0');
  await press(page, mute);
  await expect(mute).toHaveAttribute('data-muted', '1');
  // The press must not have moved the player or resolved anything.
  await expect(canvas).toHaveAttribute('data-player-lane', '1');
  await press(page, mute);
  await expect(mute).toHaveAttribute('data-muted', '0');
});
