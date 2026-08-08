import { expect, test } from '@playwright/test';

test('?debug=1 renders the diagnostic HUD and its counters increment on tap', async ({ page }) => {
  await page.goto('/play?debug=1');

  const hud = page.getByTestId('debug-hud');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('p.down=0');
  await expect(hud).toContainText('dpr=');

  const canvas = page.getByTestId('game-canvas');
  await page.getByTestId('start-button').click();

  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (await page.evaluate(() => 'ontouchstart' in window)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);

  // The passive capture-phase counters must see the gesture.
  await expect(hud).not.toContainText('p.down=0');
  await expect(hud).toContainText(/last=(pointer|touch)/);
  // Mapped virtual coords are reported alongside the raw client coords.
  await expect(hud).toContainText(/client=[\d.]+,[\d.]+ virt=[-\d.]+,[-\d.]+/);
});

test('the HUD is absent without ?debug=1', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('debug-hud')).toHaveCount(0);
});
