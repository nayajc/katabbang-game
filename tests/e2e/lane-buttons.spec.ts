import { expect, test, type Locator, type Page } from '@playwright/test';
import { huntCounterWindow } from './encounter';

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

/**
 * REGRESSION: one press moved TWO lanes.
 *
 * The buttons act on `pointerdown` and fall back to `click` when pointer events
 * are silent. That fallback used to be gated on the 50ms `pointer-health`
 * window — but `click` is dispatched at RELEASE, so any press held longer than
 * 50ms (i.e. every real human press) fell outside the window, the fallback
 * concluded pointer events were dead, and the lane moved a second time.
 *
 * Synthetic presses (`click()` / `tap()`, both <50ms) stayed inside the window,
 * which is exactly why the suite above never caught it. So every press here is
 * either HELD for a realistic duration or dispatched by hand, and every
 * assertion is a single direct read — polling could otherwise sample the lane
 * between the pointerdown and the duplicate click and pass on the transient.
 *
 * Each step also moves AWAY from the clamp it would hit on a double fire, so a
 * doubled press lands on a different lane rather than being masked by clamping.
 */
test('one press moves exactly one lane, on mouse, touch and the click fallback', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  /** Lets the trailing `click` of a gesture land before the lane is read. */
  const settle = () => page.waitForTimeout(150);

  // --- mouse, held for a realistic press duration (0 -> 1, never 2) ---
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-player-lane', '0');
  await page.getByTestId('lane-right').click({ delay: 160 });
  await settle();
  expect(await lane(canvas)).toBe('1');

  // A longer hold must be no different.
  await page.keyboard.press('ArrowLeft');
  await page.getByTestId('lane-right').click({ delay: 420 });
  await settle();
  expect(await lane(canvas)).toBe('1');

  // --- touch, held (2 -> 1, never 0) ---
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
  await page.getByTestId('lane-left').evaluate(async (el) => {
    const base = {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', base));
    await new Promise((r) => setTimeout(r, 220));
    el.dispatchEvent(new PointerEvent('pointerup', base));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
  expect(await lane(canvas)).toBe('1');

  // --- pointer-silent browser: a bare click with no pointerdown at all must
  // still move the player, and still only once (0 -> 1, never 2).
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-player-lane', '0');
  await page
    .getByTestId('lane-right')
    .evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await settle();
  expect(await lane(canvas)).toBe('1');
});

test('the lane buttons are absent on the title screen and return for a run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('lane-left')).toHaveCount(0);
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('lane-left')).toBeVisible();
  await expect(page.getByTestId('lane-right')).toBeVisible();
});

test('a lane button tap during slowmo does not count as a counter tap', async ({ page }) => {
  // See tests/e2e/encounter.ts for why the hunt is budgeted this way and why it
  // must run in-page rather than as a Playwright polling loop.
  test.setTimeout(320_000);
  // ?debug=1 publishes `data-counter-lead`, which `huntCounterWindow` needs.
  await page.goto('/play?debug=1');
  const stage = page.locator('[data-phase]');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();

  const encounter = await huntCounterWindow(page);
  expect(encounter, 'a bumper engaged with a fresh counter window').not.toBeNull();
  const before = encounter!.lane;

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

  // The mute button shares the lane buttons' pointerdown + click-fallback path,
  // so it had the same double-fire: a held press toggled twice and looked dead.
  await mute.click({ delay: 180 });
  await page.waitForTimeout(150);
  expect(await mute.getAttribute('data-muted')).toBe('1');
});
