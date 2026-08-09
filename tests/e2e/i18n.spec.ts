import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'katabbang.locale';

test.beforeEach(async ({ page }) => {
  // Seed only on the first visit — a reload must observe the persisted choice.
  await page.addInitScript((key) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, 'ko');
  }, STORAGE_KEY);
});

test('the language toggle switches the title screen to English and persists', async ({ page }) => {
  await page.goto('/');

  const heading = page.getByTestId('title-heading');
  await expect(heading).toHaveText('어깨빵 응징 러너');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR');

  const toggle = page.getByTestId('locale-toggle').first();
  await toggle.click();

  await expect(toggle).toHaveAttribute('data-locale', 'en');
  await expect(heading).toHaveText('Shoulder Check Payback');
  await expect(page.getByTestId('start-button')).toHaveText('Start');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('en');

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByTestId('title-heading')).toHaveText('Shoulder Check Payback');
  await expect(page.getByTestId('locale-toggle').first()).toHaveAttribute('data-locale', 'en');
});

test('the toggle cycles KO -> EN -> 中文 -> KO', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('locale-toggle').first();
  await expect(toggle).toHaveAttribute('data-locale', 'ko');

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-locale', 'en');

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-locale', 'zh');
  await expect(page.getByTestId('title-heading')).toHaveText('撞肩制裁跑酷');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-locale', 'ko');
});
