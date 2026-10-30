// Renders the SVG app icons to the PNG sizes that Android and iOS install prompts need.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const app of ['client', 'field', 'staff']) {
  const svg = readFileSync(`public/icons/${app}.svg`, 'utf8');
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: `public/icons/${app}-${size}.png`, omitBackground: true });
  }
}
await browser.close();
