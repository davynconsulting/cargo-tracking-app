import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signIn } from './helpers';

test('driver records a milestone with no signal and it sends when signal returns (FRS 5.1, AC-17)', async ({ page, context }) => {
  await signIn(page, 'field', 'juma@ngb.test');
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  const card = page.locator('.card', { hasText: 'TGHU2290550' });
  await context.setOffline(true);
  await card.getByRole('button', { name: 'Empty container returned' }).click();
  await page.getByLabel('Empty depot').fill('Kurasini ICD');
  await page.getByRole('button', { name: 'Send update' }).click();
  await expect(page.getByText('1 update waiting to send')).toBeVisible();
  await expect(card.getByText(/Waiting to send/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('1 update waiting to send')).toBeHidden({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Sent' }).click();
  await expect(page.locator('.badge', { hasText: 'Sent' })).toBeVisible();
});

test('driver can switch the app to Swahili', async ({ page }) => {
  await signIn(page, 'field', 'hamisi@ngb.test');
  await page.getByRole('button', { name: 'Kiswahili' }).click();
  await expect(page.getByRole('heading', { name: 'Safari zangu' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
});
