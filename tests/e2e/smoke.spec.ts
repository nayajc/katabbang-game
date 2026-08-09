import { expect, test } from '@playwright/test';

test('title -> start -> canvas is playable', async ({ page }) => {
  await page.goto('/');

  const title = page.getByTestId('title-screen');
  await expect(title).toBeVisible();
  // Title text is locale-dependent (see i18n.spec.ts) — assert the element, not the copy.
  await expect(page.getByTestId('title-heading')).toBeVisible();

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();

  await page.getByTestId('start-button').click();
  await expect(title).toBeHidden();

  // The canvas has a non-zero backing store, i.e. the loop is rendering.
  const size = await canvas.evaluate((el) => ({
    w: (el as HTMLCanvasElement).width,
    h: (el as HTMLCanvasElement).height,
  }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
});
