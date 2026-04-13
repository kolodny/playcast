# playcast

[![npm version](https://img.shields.io/npm/v/playcast.svg)](https://www.npmjs.com/package/playcast)
[![npm downloads](https://img.shields.io/npm/dm/playcast.svg)](https://www.npmjs.com/package/playcast)

Record a Playwright screencast with pinch-zoom, action annotations, and variable-speed segments. Produces `.webm` or `.mp4` output, with multi-segment stitching via ffmpeg.

## Install

```
npm install playcast
```

Peer dependency: `playwright` (>=1.59.0, requires `page.screencast` API). ffmpeg is required at runtime for multi-segment recordings and non-webm output formats (e.g. `.mp4`).

## Usage

```ts
import { chromium } from 'playwright';
import { create } from 'playcast';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://example.com');

const cast = create(page);
await cast.start('output.webm');

await cast.click(page.getByRole('button', { name: 'Sign in' }));
const email = page.getByRole('textbox', { name: 'Email' });
await cast.type(email, 'user@example.com');

await cast.setSpeed(4); // fast-forward through loading
await page.waitForSelector('.dashboard');
await cast.setSpeed(1); // back to normal

const file = await cast.stop();
console.log(file); // "output.webm"

await browser.close();
```

## API

### `create(page, options?)`

Returns a playcast recorder bound to the given Playwright `Page`.

**Options:**

| Option        | Default | Description                                                   |
| ------------- | ------- | ------------------------------------------------------------- |
| `scale`       | `2.5`   | Default pinch-zoom scale factor                               |
| `settleMs`    | `600`   | Pause after zoom gesture (ms)                                 |
| `zoomTo`      | `false` | Auto-zoom to elements on `click()` and `type()`               |
| `showActions` | `{}`    | Options for Playwright's `showActions`, or `false` to disable |
| `typeDelayMs` | `250`   | Delay between keystrokes in `type()` (ms)                     |
| `timeout`     | `10000` | Timeout for element `waitFor` calls (ms)                      |

### Recorder methods

#### `start(path)`

Begin recording. `path` is the output file path — the extension determines the format (e.g. `'demo.webm'` or `'demo.mp4'`).

#### `stop(options?)`

Stop recording and produce the final video. If multiple segments were created (via `setSpeed`, `pause`/`resume`) or the output format isn't `.webm`, ffmpeg combines and/or transcodes the segments.

- `options.skipFFMpeg` — if `true`, skip the ffmpeg combine step and just log the command.

#### `click(locator, options?)`

Click an element. When zoomed in, uses scroll suppression and force-click to prevent the page from jumping.

- `options.zoom` — `true` or zoom options object to zoom into the element before clicking.
- `options.showActions` — override `showActions` for this click, or `false` to suppress the annotation.

#### `type(locator, text, options?)`

Type into an element character by character using `pressSequentially`. Playwright's `showActions` displays a "Type ..." annotation.

- `options.delayMs` — per-character delay (default: `typeDelayMs` from create options).
- `options.zoom` — `true` or zoom options object to zoom into the element before typing.
- `options.showActions` — override `showActions` for this type, or `false` to suppress the annotation.

#### `zoom(target, options?)`

Pinch-zoom into an element or region using CDP. `target` can be a Playwright `Locator` or a bounding box `{ x, y, width, height }`.

- `options.scale` — zoom factor (default: `scale` from create options).
- `options.settleMs` — wait time after gesture.
- `options.relativeSpeed` — gesture speed (default: `600`).

#### `zoomOut()`

Reset zoom to 1x.

#### `setSpeed(factor)`

Change playback speed for subsequent recording. Creates a new segment — previous footage keeps its original speed.

#### `pause()` / `resume()`

Pause and resume recording. Anything that happens while paused is not captured.

## Demos

Example recordings produced by the scripts in `demos/`:

### Wikipedia search — `type`, `click`, `zoomTo`

<video src="assets/basic.webm" autoplay loop muted playsinline></video>

### TodoMVC — `type`, `click`, `zoom`, `zoomOut`

<video src="assets/todomvc.webm" autoplay loop muted playsinline></video>

### Hacker News — `click`, `zoom`, `setSpeed`, `pause`/`resume`

<video src="assets/hackernews.mp4" autoplay loop muted playsinline></video>

### Timing — `pause`, `resume`, `setSpeed`, `showChapter`

<video src="assets/timing.webm" autoplay loop muted playsinline></video>

Run them yourself with `npm run demos` or individually with `npx tsx demos/basic.ts`.

## How it works

Playcast uses Playwright's `page.screencast` API to capture video as `.webm` segments. Each call to `setSpeed()` or `pause()`/`resume()` creates a new segment. When `stop()` is called, ffmpeg combines segments with per-segment `setpts` filters for speed adjustment, and transcodes to the output format if needed (e.g. `.mp4`).

Zoom is implemented via CDP `Input.synthesizePinchGesture`, with patches to prevent `scrollIntoView` and `focus()` from disrupting the zoomed viewport.

## License

MIT
