import { expect, test } from '@playwright/test';

/**
 * Opening-grace regression, measured on the real build: an idle run must not be
 * over within 8 seconds. Before the grace period + i-frames a no-input run died
 * in ~3s, which players read as "the controls don't work".
 */
test('an untouched run is still alive after 8 seconds', async ({ page }) => {
  await page.goto('/play');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('title-screen')).toHaveCount(0);

  const started = Date.now();
  await page.waitForTimeout(8000);
  expect(Date.now() - started).toBeGreaterThanOrEqual(8000);
  await expect(page.getByTestId('gameover-screen')).toHaveCount(0);
});
