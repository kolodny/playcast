import type { Page, Locator, CDPSession, Disposable } from 'playwright';
import { execSync } from 'child_process';

export interface ZoomObj {
  /** Zoom scale factor (default: uses playcast default) */
  scale?: number;
  /** Settle time after pinch gesture in ms (default: uses playcast default) */
  settleMs?: number;
  /** Pinch gesture speed — lower is slower (default: 600) */
  relativeSpeed?: number;
}
type Zoom = boolean | ZoomObj;

type ShowActionsParameters = Parameters<Page['screencast']['showActions']>[0];
type ShowActions = false | ShowActionsParameters;

export interface PlaycastOptions {
  /** Default zoom scale factor (default: 2.5) */
  scale?: number;
  /** Default settle time after pinch gesture in ms (default: 600) */
  settleMs?: number;
  /** Auto-zoom to elements on click() and type() (default: false) */
  zoomTo?: boolean;
  /** Options for Playwright's showActions, or false to disable (default: { duration: 500 }) */
  showActions?: ShowActions;
  /** Keystroke overlay delay between characters in ms (default: 250) */
  typeDelayMs?: number;
  /** Timeout for element waitFor calls in ms (default: 10000) */
  timeout?: number;
}

export type Playcast = Awaited<ReturnType<typeof create>>;

interface Segment {
  path: string;
  speed: number;
}

const PINCH = 'Input.synthesizePinchGesture';

export function create(page: Page, options: PlaycastOptions = {}) {
  const {
    scale: defaultScale = 2.5,
    settleMs = 600,
    zoomTo: defaultZoomTo = false,
    showActions,
    typeDelayMs: defaultTypeDelay = 250,
    timeout: defaultTimeout,
  } = options;

  let cdp: CDPSession;
  let currentScale = 1;
  let currentSpeed = 1;
  let recording = false;
  let basePath = '';
  let segmentIndex = 0;
  const segments: Segment[] = [];
  let disposeActions: Disposable | undefined;

  const segmentPath = () => `${basePath}-seg${segmentIndex}.webm`;

  // --- Internal helpers ---

  const startSegment = async () => {
    if (recording) return;
    const path = segmentPath();
    await page.screencast.start({ path });
    if (showActions !== false) {
      try {
        disposeActions = await page.screencast.showActions(showActions);
      } catch {}
    }
    recording = true;
  };

  const stopSegment = async () => {
    if (!recording) return;
    await page.screencast.stop();
    disposeActions?.dispose();
    disposeActions = undefined;

    segments.push({ path: segmentPath(), speed: currentSpeed });
    segmentIndex++;
    recording = false;
  };

  const ensureNameShim = () => page.evaluate(`window.__name ??= (fn) => fn`);
  ensureNameShim();

  // Fix showActions annotations during pinch zoom. The glass pane renders at
  // layout-viewport coords but the visual viewport is offset when zoomed.
  // Installed via addInitScript so it survives page navigations.
  // Toggled on during zoom, off after zoomOut, so the RAF loop
  // doesn't interfere with showActions when not zoomed.
  const startGlassPatch = async () => {
    await page.evaluate(`(function() {
      window.__glassPatchActive = true;
      if (window.__glassPatchRunning) return;
      window.__glassPatchRunning = true;
      (function patch() {
        if (!window.__glassPatchActive) { window.__glassPatchRunning = false; return; }
        var glass = document.querySelector('x-pw-glass');
        var vv = window.visualViewport;
        if (glass && vv && vv.scale !== 1) {
          glass.style.transform = 'translate(' + vv.offsetLeft + 'px, ' + vv.offsetTop + 'px)';
          glass.style.transformOrigin = '0 0';
          glass.style.width = vv.width + 'px';
          glass.style.height = vv.height + 'px';
        }
        requestAnimationFrame(patch);
      })();
    })()`);
  };

  const stopGlassPatch = async () => {
    await page.evaluate(`window.__glassPatchActive = false`);
  };

  const patchScrollBehaviorForZoom = async () => {
    await ensureNameShim();
    await page.evaluate(() => {
      const win = window as any;
      const El = Element as any;
      if (win.__zoomScrollPatch) return;
      win.__zoomScrollPatch = true;

      var origFocus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function (opts) {
        if (win.visualViewport && win.visualViewport.scale > 1) {
          opts = Object.assign({}, opts, { preventScroll: true });
        }
        return origFocus.call(this, opts);
      };

      win.__suppressScrollIntoView = false;

      var origScroll = El.prototype.scrollIntoView;
      El.prototype.scrollIntoView = function (opts: any) {
        if (win.__suppressScrollIntoView) return;
        return origScroll.call(this, opts);
      };

      if (El.prototype.scrollIntoViewIfNeeded) {
        var origScrollIfNeeded = El.prototype.scrollIntoViewIfNeeded;
        El.prototype.scrollIntoViewIfNeeded = function (centerIfNeeded: any) {
          if (win.__suppressScrollIntoView) return;
          return origScrollIfNeeded.call(this, centerIfNeeded);
        };
      }
    });
  };

  const withScrollSuppression = async (fn: () => Promise<void>) => {
    await page.evaluate(`window.__suppressScrollIntoView = true`);
    await fn();
    await page.waitForTimeout(100);
    await page.evaluate(`window.__suppressScrollIntoView = false`);
  };

  const smoothScrollIntoView = async (locator: Locator) => {
    await locator.evaluate((el) => {
      el.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'smooth',
      });
      return new Promise<void>((resolve) => {
        const noScroll = setTimeout(resolve, 100);
        const o = { once: true };
        document.addEventListener('scroll', () => clearTimeout(noScroll), o);
        document.addEventListener('scrollend', () => resolve(), o);
        setTimeout(resolve, 3000);
      });
    });
  };

  type BoundingBox = { x: number; y: number; width: number; height: number };

  const pinchTo = async (target: Locator | BoundingBox, opts: ZoomObj = {}) => {
    const scaleFactor = opts.scale ?? defaultScale;
    const settle = opts.settleMs ?? settleMs;
    const relativeSpeed = opts.relativeSpeed ?? 600;

    const isLocator = 'locator' in target;
    let box = isLocator ? null : target;
    if (isLocator) {
      await target.waitFor({ timeout: defaultTimeout });
      await smoothScrollIntoView(target);
      box = await target.boundingBox();
    }
    if (!box) return;
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await cdp.send(PINCH, { x, y, scaleFactor, relativeSpeed });
    await startGlassPatch();
    currentScale = scaleFactor;
    await page.waitForTimeout(settle);
  };

  // --- Combine segments with ffmpeg ---

  const combineSegments = (outputPath: string, skipping: boolean) => {
    if (segments.length === 0) return outputPath;

    const inputs = segments.map((s) => `-i "${s.path}"`).join(' ');
    const filters = segments.map((s, i) => {
      const pts = s.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${s.speed}`;
      return `[${i}:v]setpts=${pts}[v${i}]`;
    });
    const concat = segments.map((_, i) => `[v${i}]`).join('');
    filters.push(`${concat}concat=n=${segments.length}:v=1[out]`);

    const filterStr = filters.join('; ');
    const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterStr}" -map "[out]" "${outputPath}"`;
    console.log(`ffmpeg command:\n\n${cmd}\n`);
    if (!skipping) {
      execSync(cmd, { stdio: 'inherit' });
      for (const s of segments) {
        try {
          execSync(`rm -f "${s.path}"`);
        } catch {}
      }
      return outputPath;
    }
  };

  // --- Public API ---

  const reapplyAfterNavigation = async () => {
    if (!recording) return;
    try {
      await ensureNameShim();
      await patchScrollBehaviorForZoom();
    } catch {}
  };

  const start = async (path: string) => {
    basePath = path.replace(/\.[^.]+$/, '');
    cdp = await page.context().newCDPSession(page);
    await patchScrollBehaviorForZoom();
    page.on('load', reapplyAfterNavigation);
    segmentIndex = 0;
    currentSpeed = 1;
    await startSegment();
  };

  const stop = async ({ skipFFMpeg }: { skipFFMpeg?: boolean } = {}) => {
    page.removeListener('load', reapplyAfterNavigation);
    await stopSegment();
    const outputPath = `${basePath}.webm`;
    if (segments.length === 1 && segments[0].speed === 1) {
      execSync(`mv "${segments[0].path}" "${outputPath}"`);
      return outputPath;
    } else {
      return combineSegments(outputPath, skipFFMpeg ?? false);
    }
  };

  const zoom = pinchTo;

  const zoomOut = async () => {
    const { x, y } = await page.evaluate(() => {
      const vv = window.visualViewport!;
      return { x: Math.round(vv.width / 2), y: Math.round(vv.height / 2) };
    });
    const scaleFactor = 1 / currentScale;
    await cdp.send(PINCH, { x, y, scaleFactor, relativeSpeed: 600 });
    await stopGlassPatch();
    currentScale = 1;
  };

  const applyShowActions = async (override?: ShowActions) => {
    if (!recording) return;
    const resolved = override ?? showActions;
    if (resolved === false) {
      disposeActions?.dispose();
      disposeActions = undefined;
      return;
    }
    try {
      disposeActions?.dispose();
      disposeActions = await page.screencast.showActions(resolved || undefined);
    } catch {}
  };

  const click = async (
    locator: Locator,
    options?: {
      zoom?: boolean | Zoom;
      showActions?: ShowActions;
    },
  ) => {
    const shouldZoom = options?.zoom ?? defaultZoomTo;
    if (shouldZoom) {
      const z = typeof options?.zoom === 'object' ? options.zoom : {};
      await pinchTo(locator, z);
    }
    if (options?.showActions !== undefined)
      await applyShowActions(options.showActions);
    else await applyShowActions();
    if (currentScale > 1) {
      await locator.waitFor({ state: 'visible', timeout: defaultTimeout });
      await withScrollSuppression(() => locator.click({ force: true }));
    } else {
      await locator.click();
    }
    // Restore default if overridden
    if (options?.showActions !== undefined) await applyShowActions();
  };

  const type = async (
    locator: Locator,
    text: string,
    options?: { delayMs?: number; zoom?: Zoom; showActions?: ShowActions },
  ) => {
    const delay = options?.delayMs ?? defaultTypeDelay;

    const shouldZoom = options?.zoom ?? defaultZoomTo;
    if (shouldZoom) {
      const z = typeof options?.zoom === 'object' ? options.zoom : {};
      await pinchTo(locator, z);
    }
    if (options?.showActions !== undefined)
      await applyShowActions(options.showActions);
    else await applyShowActions();
    await locator.pressSequentially(text, { delay });
    if (options?.showActions !== undefined) await applyShowActions();
  };

  const pause = stopSegment;
  const resume = startSegment;

  const setSpeed = async (factor: number) => {
    await stopSegment();
    currentSpeed = factor;
    await startSegment();
  };

  return { start, stop, zoom, zoomOut, click, type, pause, resume, setSpeed };
}
