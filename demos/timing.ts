/**
 * Timing demo — pause, resume, speed control, and chapters
 *
 * Uses a live clock page to visually demonstrate how playcast
 * manipulates recording time.
 *
 * Shows: pause, resume, setSpeed, showChapter
 * Run: npx tsx demos/timing.ts
 */
import { chromium } from 'playwright';
import { create } from '../src/index.ts';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

await page.goto(`data:text/html,
<style>
  body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: %23111; color: %23eee; font-family: system-ui; }
  .clock { font-size: 120px; font-weight: 200; letter-spacing: 4px; font-variant-numeric: tabular-nums; }
  .date { font-size: 28px; color: %23888; margin-top: 12px; text-align: center; }
</style>
<div>
  <div class="clock" id="c"></div>
  <div class="date" id="d"></div>
</div>
<script>
  var start = Date.now();
  var epoch = new Date(2025, 0, 1, 9, 30, 0).getTime();
  function tick() {
    var now = new Date(epoch + (Date.now() - start));
    const two = '2-digit';
    const timeOptions = { hour: two, minute: two, second: two };
    const $ = (id) => document.getElementById(id);
    $('c').textContent = now.toLocaleTimeString('en-US', timeOptions);
    const n = 'numeric';
    const l = 'long';
    const dateOptions = { weekday: l, month: l, day: n, year: n };
    $('d').textContent = now.toLocaleDateString('en-US', dateOptions);
    requestAnimationFrame(tick);
  }
  tick();
</script>`);
await page.waitForTimeout(1000);

const cast = create(page, { showActions: false });
await cast.start('assets/timing.webm');

// Chapter: intro
await page.screencast.showChapter('Recording at 1x', {
  description: 'Watch the seconds tick in real time',
  duration: 2000,
});
await page.waitForTimeout(4000);

// Chapter: pause
await page.screencast.showChapter('Pausing...', {
  description: '5 seconds will pass off-camera',
  duration: 1500,
});
await page.waitForTimeout(500);
await cast.pause();
await page.waitForTimeout(5000);
await cast.resume();

await page.screencast.showChapter('Resumed', {
  description: 'Notice the clock jumped 5 seconds',
  duration: 2000,
});
await page.waitForTimeout(3000);

// Chapter: speed up
await page.screencast.showChapter('4x speed', {
  description: 'Same clock, fast-forwarded',
  duration: 1500,
});
await cast.setSpeed(4);
await page.waitForTimeout(8000);

// Chapter: slow down
await cast.setSpeed(0.5);
await page.screencast.showChapter('0.5x speed', {
  description: 'Now in slow motion',
  duration: 1500,
});
await page.waitForTimeout(4000);

// Back to normal
await cast.setSpeed(1);
await page.screencast.showChapter('Back to 1x', { duration: 1500 });
await page.waitForTimeout(2000);

const output = await cast.stop();
console.log(`Output: ${output}`);

await browser.close();
