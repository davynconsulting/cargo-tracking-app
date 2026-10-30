import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signIn } from './helpers';

test('client sees only their shipments, with ETA, containers and timeline, on a phone (US-02, AC-17)', async ({ page }) => {
  await signIn(page, 'client', 'aline@khl.test');
  await expect(page.getByRole('heading', { name: 'Your shipments' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expect(page.getByText('NGB-2026-00004')).toHaveCount(0); // another client's shipment

  await page.getByRole('link', { name: /NGB-2026-00001/ }).click();
  await expect(page.getByText('Estimated delivery')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
  await expect(page.getByText('MSCU4821206').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  for (const tab of ['Invoices', 'Messages', 'Settings']) {
    await page.getByRole('navigation').getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { name: tab, exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test('a driver account cannot sign in to the client portal', async ({ page }) => {
  await signIn(page, 'client', 'juma@ngb.test');
  await expect(page.getByRole('alert')).toContainText('driver app');
});
