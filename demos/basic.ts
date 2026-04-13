/**
 * Basic playcast demo — Wikipedia search
 *
 * Shows: start, stop, type, click, zoomTo
 * Run: npx tsx demos/basic.ts
 */
import { chromium } from 'playwright';
import { create } from '../src/index.ts';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

await page.goto('https://en.wikipedia.org');

const cast = create(page, { typeDelayMs: 100, settleMs: 10 });
await cast.start('assets/basic.gif');

// Type a search query
const search = page.getByRole('searchbox', { name: 'Search Wikipedia' });
await cast.type(search, 'Aurora borealis', { zoom: true });
await page.waitForTimeout(300);
await cast.zoomOut();

// Submit the search
await cast.click(page.getByRole('button', { name: 'Search' }));
await page.waitForTimeout(1500);

// Click the first link in the article body
const firstLink = page.locator('#mw-content-text a[href^="/wiki/"]').first();
await cast.click(firstLink);
await page.waitForTimeout(2000);

const output = await cast.stop();
console.log(`Output: ${output}`);

await browser.close();
