import { expect, test, type Page } from '@playwright/test';
import { huntCounterWindow } from './encounter';

/**
 * The desktop counter key (Space / Enter).
 *
 * REPORTED AS: "spacebar doesn't work on desktop".
 *
 * The suspected cause was focus theft — the lane / mute controls are real DOM
 * <button>s now, and a focused button natively activates on Space, which would
 * make the counter key move a lane or toggle mute instead of striking. That is
 * NOT what happens (see the first two tests: focus never even lands on a
 * control, and Space does not activate one even when focus is forced there).
 *
 * The real cause was silence: `Game.onCounter` returned without any reaction
 * whatsoever when no counter window was armed, which is almost the whole run.
 * Every off-beat press was swallowed with no sound, no animation and no caption,
 * so the key was indistinguishable from a dead one. `data-whiffs` counts the
 * presses the game acknowledged, and it is the assertion that the key is live.
 *
 * The reaction ITSELF (jab, swish, caption, and the fact that it costs nothing)
 * is pinned in tests/unit/whiff.test.ts — this file is only about the key path.
 */

function stage(page: Page) {
  return page.locator('[data-phase]');
}

async function whiffs(page: Page): Promise<number> {
  return Number((await stage(page).getAttribute('data-whiffs')) ?? 0);
}

test('Space is acknowledged outside the counter window and moves nothing', async ({ page }) => {
  await page.goto('/play');
  const canvas = page.getByTestId('game-canvas');
  const mute = page.getByTestId('mute-button');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  // Mouse-click the controls first: this is the exact sequence in the report.
  await page.getByTestId('lane-right').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '2');
  await mute.click();
  await expect(mute).toHaveAttribute('data-muted', '1');

  // The press must reach the game (whiff count rises) and change nothing else.
  const before = await whiffs(page);
  await page.keyboard.press('Space');
  await expect.poll(() => whiffs(page)).toBe(before + 1);
  expect(await canvas.getAttribute('data-player-lane')).toBe('2');
  expect(await mute.getAttribute('data-muted')).toBe('1');

  // Enter is the second counter key and must behave identically.
  await page.keyboard.press('Enter');
  await expect.poll(() => whiffs(page)).toBe(before + 2);
  expect(await canvas.getAttribute('data-player-lane')).toBe('2');
  expect(await mute.getAttribute('data-muted')).toBe('1');

  // A control must never be left holding focus after a press.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
});

test('Space cannot activate a control even when focus is forced onto it', async ({ page }) => {
  await page.goto('/play');
  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();
  await expect(canvas).toHaveAttribute('data-player-lane', '1');

  // Lane buttons are pointer-only controls (arrow keys cover lanes), so they are
  // out of the tab order entirely.
  expect(await page.getByTestId('lane-right').getAttribute('tabindex')).toBe('-1');

  // Even forced focus must not turn Space into a lane change: the window
  // `keydown` handler cancels the button's activation behaviour.
  await page.getByTestId('lane-right').evaluate((el) => (el as HTMLElement).focus());
  const before = await whiffs(page);
  await page.keyboard.press('Space');
  await expect.poll(() => whiffs(page)).toBe(before + 1);
  expect(await canvas.getAttribute('data-player-lane')).toBe('1');
});

test('Space still judges a counter during slowmo after the controls were clicked', async ({
  page,
}) => {
  test.setTimeout(320_000);
  await page.goto('/play?debug=1');
  const el = stage(page);
  await page.getByTestId('start-button').click();

  // Click the controls with the real mouse before the encounter, so the counter
  // key is exercised in exactly the state the report describes.
  await page.getByTestId('lane-right').click();
  await page.getByTestId('lane-left').click();
  await page.getByTestId('mute-button').click();

  // See tests/e2e/encounter.ts: the hunt must run in-page, and it only returns a
  // window with real slack left, so the keyboard round trip below cannot let the
  // window EXPIRE and have the expiry's miss look like the press's judgement.
  const whiffsBefore = await whiffs(page);
  const encounter = await huntCounterWindow(page);
  expect(encounter, 'a bumper engaged with a fresh counter window').not.toBeNull();

  await page.keyboard.press('Space');

  // The window was armed, so this press is a JUDGED counter, never a whiff.
  await expect(el).toHaveAttribute('data-last-judge', /^(perfect|good|miss):/);
  expect(await whiffs(page)).toBe(whiffsBefore);
});
