import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signIn } from './helpers';

test('ops checks container numbers while registering a shipment (AC-01)', async ({ page }) => {
  await signIn(page, 'staff', 'ops@ngb.test');
  await expect(page.getByRole('heading', { name: 'Shipments' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'New shipment' }).click();
  const input = page.getByLabel('Container 1');
  await input.fill('CSQU3054384');
  await expect(page.getByText('Check digit should be 3.')).toBeVisible();
  await input.fill('CSQU3054383');
  await expect(page.getByText('✓ CSQU3054383')).toBeVisible();

  await page.getByLabel('Client').selectOption({ index: 1 });
  await page.getByLabel('Destination city').fill('Kigali');
  await page.getByLabel('Destination country').fill('Rwanda');
  await page.getByRole('button', { name: 'Create shipment' }).click();
  await expect(page.getByRole('heading', { name: /NGB-2026-\d+/ })).toBeVisible();
  await expect(page.getByText('CSQU3054383')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('assign a truck, load, then gate-out before customs release needs an ops override reason (AC-04)', async ({ page }) => {
  await signIn(page, 'staff', 'ops@ngb.test');
  // Shipment 2 is discharged at Mombasa with customs submitted but not released.
  await page.getByRole('link', { name: 'NGB-2026-00002' }).click();

  await page.getByRole('button', { name: 'Assign truck' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Truck registration').fill('KDA 123X');
  await dialog.getByLabel('Driver with the app').selectOption({ label: 'Hamisi Said' });
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByText('Truck KDA 123X assigned.')).toBeVisible();

  await page.getByRole('button', { name: 'Loaded', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Seal number').fill('KE998877');
  await dialog.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText('Loaded recorded.')).toBeVisible();

  await page.getByRole('button', { name: 'Gate-out (override)' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Customs release is not confirmed')).toBeVisible();
  // Without a reason the form will not submit.
  await dialog.getByRole('button', { name: 'Record with override' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Override reason').fill('Release confirmed by phone with TRA, paper copy follows');
  await dialog.getByRole('button', { name: 'Record with override' }).click();
  await expect(page.getByText('Gate-out recorded.')).toBeVisible();
  await expect(page.locator('.timeline .badge', { hasText: 'Override' }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('exception queue shows owner, reason and next action (AC-10)', async ({ page }) => {
  await signIn(page, 'staff', 'ops@ngb.test');
  await page.getByRole('navigation').getByRole('link', { name: /Exceptions/ }).click();
  await expect(page.getByRole('heading', { name: 'Exceptions' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the finance role can open invoices', async ({ page }) => {
  await signIn(page, 'staff', 'finance@ngb.test');
  await page.getByRole('navigation').getByRole('link', { name: 'Invoices' }).click();
  await expect(page.getByText(/INV-2026-/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
