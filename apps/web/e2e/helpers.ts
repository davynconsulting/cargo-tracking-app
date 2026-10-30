import { expect, Page } from '@playwright/test';

export const PASSWORD = 'prototype-password';

export async function signIn(page: Page, app: 'client' | 'field' | 'staff', email: string) {
  await page.goto(`/${app}/`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** AC-17: nothing on the page is wider than the phone screen. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `page is ${scroll}px wide on a ${inner}px screen`).toBeLessThanOrEqual(inner);
}
