/**
 * Hacker News demo — speed control and pause/resume
 *
 * Shows: setSpeed, pause, resume, click, zoom, zoomOut
 * Run: npx tsx demos/hackernews.ts
 */
import { chromium } from 'playwright';
import { create } from '../src/index.ts';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

await page.goto('https://news.ycombinator.com/front?day=2025-01-01');
await page.locator('.titleline a').first().waitFor();

const cast = create(page, { zoomTo: true });
await cast.start('assets/hackernews.mp4');
await page.waitForTimeout(500);

// Click the Déjà vu article (auto-zooms via zoomTo)
const article = page.locator('.titleline a', { hasText: 'Ghostly CVEs' });
await cast.click(article);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1000);
await cast.zoomOut();

// Smooth scroll down to the video
const playBtn = page.locator('.yt-play');
await playBtn.evaluate(async (el) => {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return new Promise<void>((resolve) => {
    document.addEventListener('scrollend', () => resolve(), { once: true });
  });
});
await page.waitForTimeout(500);

// Zoom into the video and play it
await cast.zoom(playBtn, { scale: 1.5 });
await playBtn.click({ force: true });
await page.waitForTimeout(5000);
// Pause the YouTube video by clicking the iframe element
await cast.zoomOut();
await page.locator('iframe').first().click({ force: true });
await page.waitForTimeout(1000);

// Go back to HN
await page.goBack();
await page.locator('.titleline a').first().waitFor();
await page.waitForTimeout(500);

await page.waitForTimeout(1000);

await cast.setSpeed(0.8);
const commentsLink = page
  .locator('td.subtext a')
  .filter({ hasText: 'comments' })
  .first();
await cast.click(commentsLink);
await page.locator('.comment').first().waitFor();
await cast.setSpeed(1);

// Scroll to and highlight a specific comment
const comment = page
  .locator('.comment')
  .filter({ hasText: 'The situation here' })
  .first();
await page.waitForTimeout(500);
await cast.zoom(comment, { scale: 1.5, relativeSpeed: 1500 });
await page.waitForTimeout(1000);
await cast.zoomOut();
await page.waitForTimeout(500);

const output = await cast.stop();
console.log(`Output: ${output}`);

await browser.close();
