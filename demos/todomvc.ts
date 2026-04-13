/**
 * TodoMVC demo — typing, clicking, and zoom
 *
 * Shows: type, click, zoom, zoomOut
 * Run: npx tsx demos/todomvc.ts
 */
import { chromium } from 'playwright';
import { create } from '../src/index.ts';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

await page.goto('https://todomvc.com/examples/react/dist/');
await page.waitForTimeout(500);

const cast = create(page, { scale: 2, typeDelayMs: 100 });
await cast.start('assets/todomvc.gif');

const input = page.getByPlaceholder('What needs to be done?');

// Add some todos
for (const todo of ['Buy groceries', 'Walk the dog', 'Write docs']) {
  await cast.type(input, todo);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

// Check off the first two
const toggles = page.getByTestId('todo-item-toggle');
await cast.click(toggles.nth(0));
await page.waitForTimeout(200);
await cast.click(toggles.nth(1));
await page.waitForTimeout(300);

// Zoom into the filter bar
const filters = page.getByTestId('footer-navigation');
await cast.zoom(filters);
await page.waitForTimeout(600);

// Click "Active" filter
await cast.click(page.getByRole('link', { name: 'Active' }));
await page.waitForTimeout(500);

// Click "Completed" filter
await cast.click(page.getByRole('link', { name: 'Completed' }));
await page.waitForTimeout(500);

// Click "All" and zoom back out
await cast.click(page.getByRole('link', { name: 'All' }));
await cast.zoomOut();
await page.waitForTimeout(500);

const output = await cast.stop();
console.log(`Output: ${output}`);

await browser.close();
