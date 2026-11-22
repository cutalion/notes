import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { promisify } from 'node:util';

import { chromium } from 'playwright-core';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = path.join(packageRoot, 'tests', 'fixture');
const runFile = promisify(execFile);
const testPort = await findFreePort();
const baseUrl = `http://127.0.0.1:${testPort}`;
let browser;
let preview;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function browserExecutable() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) return configured;

  const expected = chromium.executablePath();
  if (fs.existsSync(expected)) return expected;

  const browsersRoot = path.resolve(expected, '../../..');
  if (!fs.existsSync(browsersRoot)) return undefined;
  const revisions = fs.readdirSync(browsersRoot)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse();
  for (const revision of revisions) {
    const executable = path.join(browsersRoot, revision, 'chrome-linux64', 'chrome');
    if (fs.existsSync(executable)) return executable;
  }
  return undefined;
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The preview did not become ready on localhost');
}

before(async () => {
  const env = { ...process.env, NOTES_PORT: String(testPort) };
  await runFile(process.execPath, [path.join(packageRoot, 'bin', 'notes.mjs'), 'build', '--strict'], { cwd: fixtureRoot, env });
  preview = spawn(process.execPath, [path.join(packageRoot, 'scripts', 'preview.mjs')], { cwd: fixtureRoot, env, stdio: 'pipe' });
  await waitForPreview();
  browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
});

after(async () => {
  await browser?.close();
  preview?.kill('SIGTERM');
});

test('representative Markdown renders without remote assets', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const requestedOrigins = new Set();
  const browserErrors = [];
  page.on('request', (request) => requestedOrigins.add(new URL(request.url()).origin));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(`${baseUrl}/models-overview/`);
  await page.waitForFunction(() => document.querySelectorAll('pre.mermaid svg').length === 3);
  assert.equal(await page.locator('pre.mermaid svg').count(), 3);
  assert.ok(await page.locator('table').count() > 0);
  assert.equal(await page.locator('.pagination-links').count(), 0);

  await page.goto(`${baseUrl}/payments/state-machines/`);
  await page.waitForFunction(() => document.querySelectorAll('pre.mermaid svg').length === 3, undefined, { timeout: 10000 })
    .catch(() => assert.fail(`State diagrams did not render: ${browserErrors.join(' | ')}`));
  assert.equal(await page.locator('pre.mermaid svg').count(), 3);

  await page.goto(`${baseUrl}/guide/payments/`);
  assert.equal(await page.locator('h1').first().textContent(), 'Как устроены платежи');
  assert.ok(await page.locator('.notes-code').count() > 0);

  await page.goto(`${baseUrl}/payments/review/`);
  await page.locator('starlight-theme-select select').first().selectOption('light');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  const tokenColors = await page.locator('.notes-code').first().locator('code span').evaluateAll((tokens) => [
    ...new Set(tokens.map((token) => getComputedStyle(token).color)),
  ]);
  assert.ok(tokenColors.length >= 3);

  await page.goto(`${baseUrl}/topups/notes/`);
  assert.ok(await page.locator('.starlight-aside').count() > 0);
  assert.equal(await page.locator('.sl-markdown-content img').count(), 2);
  assert.ok(await page.locator('.sl-markdown-content img').first().evaluate((image) => image.complete && image.naturalWidth > 0));
  assert.deepEqual([...requestedOrigins], [baseUrl]);
  await page.close();
});

test('theme switching persists and rerenders Mermaid', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/models-overview/`);
  await page.waitForSelector('pre.mermaid svg');
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-viewport').length === 3);
  assert.equal(await page.locator('.mermaid-viewport').count(), 3);
  assert.equal(await page.locator('.mermaid-viewport').first().locator('.mermaid-tools button').count(), 4);

  const viewport = page.locator('.mermaid-viewport').first();
  const controlBoxes = await viewport.locator('.mermaid-tools button').evaluateAll((buttons) => (
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { height: box.height, top: box.top };
    })
  ));
  assert.equal(new Set(controlBoxes.map(({ height }) => height)).size, 1);
  assert.equal(new Set(controlBoxes.map(({ top }) => top)).size, 1);
  await viewport.locator('[data-mermaid-action="in"]').click();
  assert.equal(await viewport.evaluate((element) => element.classList.contains('is-zoomed')), true);
  assert.equal(await viewport.evaluate((element) => getComputedStyle(element).userSelect), 'none');
  assert.notEqual(
    await viewport.locator('.mermaid-pane').evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  );
  await viewport.locator('[data-mermaid-action="reset"]').click();
  assert.equal(await viewport.evaluate((element) => element.classList.contains('is-zoomed')), false);
  await viewport.evaluate((element) => {
    element.requestFullscreen = async () => { element.dataset.fullscreenRequested = 'true'; };
  });
  await viewport.locator('[data-mermaid-action="fullscreen"]').click();
  assert.equal(await viewport.getAttribute('data-fullscreen-requested'), 'true');
  const fullscreenWheelZoomed = await viewport.evaluate((element) => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    return element.classList.contains('is-zoomed');
  });
  assert.equal(fullscreenWheelZoomed, true);

  const darkId = await page.locator('pre.mermaid svg').first().getAttribute('id');

  await page.locator('starlight-theme-select select').first().selectOption('light');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.waitForFunction((previous) => document.querySelector('pre.mermaid svg')?.id !== previous, darkId);
  assert.equal(await page.evaluate(() => localStorage.getItem('starlight-theme')), 'light');

  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');

  await page.goto(`${baseUrl}/payments/services/`);
  await page.locator('starlight-theme-select select').first().selectOption('dark');
  await page.waitForSelector('pre.mermaid svg');
  await page.waitForSelector('.mermaid-viewport');
  const nodeContrast = await page.locator('pre.mermaid .node.service').first().evaluate((node) => {
    const shape = node.querySelector('rect, polygon, circle, ellipse, path');
    const label = node.querySelector('.nodeLabel, .label, text');
    const parse = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = (color) => {
      const channels = parse(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    };
    const a = luminance(getComputedStyle(shape).fill);
    const b = luminance(getComputedStyle(label).color);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(nodeContrast >= 4.5);
  await context.close();
});

test('sidebar sorts by recency or title and persists the choice', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/models-overview/`);
  const select = page.locator('#notes-sidebar-sort');
  await select.waitFor();
  assert.equal(await page.locator('#notes-sidebar-filter').count(), 0);
  assert.equal(await select.inputValue(), 'recent-desc');
  assert.equal(await select.locator('option').count(), 4);

  const recentGroupTimes = await page.locator('ul.top-level').evaluate((list) => (
    [...list.children]
      .filter((item) => item.querySelector(':scope > details'))
      .map((item) => Math.max(...[...item.querySelectorAll('a[data-note-updated]')]
        .map((link) => Number(link.dataset.noteUpdated))))
  ));
  assert.deepEqual(recentGroupTimes, [...recentGroupTimes].sort((a, b) => b - a));

  await select.selectOption('title-asc');
  const groupTitles = await page.locator('ul.top-level > li > details > summary .group-label').allTextContents();
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  assert.deepEqual(groupTitles, [...groupTitles].sort(collator.compare));

  const paymentTitles = await page
    .locator('a[data-note-group="payments"]')
    .allTextContents();
  assert.deepEqual(paymentTitles, [...paymentTitles].sort(collator.compare));
  assert.equal(await page.evaluate(() => localStorage.getItem('notes:sidebarSort')), 'title-asc');

  await page.reload();
  assert.equal(await page.locator('#notes-sidebar-sort').inputValue(), 'title-asc');
  await page.close();
});

test('desktop sidebars resize by dragging and persist their widths', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/models-overview/`);

  const leftHandle = page.locator('[data-notes-resizer="left"]');
  const rightHandle = page.locator('[data-notes-resizer="right"]');
  await leftHandle.waitFor();
  await rightHandle.waitFor();
  const leftBefore = await page.locator('.sidebar-pane').evaluate((element) => element.getBoundingClientRect().width);
  const leftBox = await leftHandle.boundingBox();
  assert.ok(leftBox);
  await page.mouse.move(leftBox.x + (leftBox.width / 2), leftBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + (leftBox.width / 2) + 48, leftBox.y + 40);
  await page.mouse.up();
  const leftAfter = await page.locator('.sidebar-pane').evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(leftAfter >= leftBefore + 45);

  const rightBefore = await page.locator('.right-sidebar-container').evaluate((element) => element.getBoundingClientRect().width);
  const rightBox = await rightHandle.boundingBox();
  assert.ok(rightBox);
  await page.mouse.move(rightBox.x + (rightBox.width / 2), rightBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(rightBox.x + (rightBox.width / 2) - 40, rightBox.y + 40);
  await page.mouse.up();
  const rightAfter = await page.locator('.right-sidebar-container').evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(rightAfter >= rightBefore + 37);

  const storedWidths = await page.evaluate(() => ({
    left: Number(localStorage.getItem('notes:leftSidebarWidth')),
    right: Number(localStorage.getItem('notes:rightSidebarWidth')),
  }));
  assert.equal(storedWidths.left, Math.round(leftAfter));
  assert.equal(storedWidths.right, Math.round(rightAfter));

  await page.reload();
  assert.equal(
    Math.round(await page.locator('.sidebar-pane').evaluate((element) => element.getBoundingClientRect().width)),
    storedWidths.left,
  );
  assert.equal(
    Math.round(await page.locator('.right-sidebar-container').evaluate((element) => element.getBoundingClientRect().width)),
    storedWidths.right,
  );
  await context.close();
});

test('desktop uses compact typography and reveals sidebar boundaries on hover', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/proofs/investigation/`);

  const styles = await page.evaluate(() => ({
    titleSize: getComputedStyle(document.querySelector('h1')).fontSize,
    bodySize: getComputedStyle(document.querySelector('.sl-markdown-content p')).fontSize,
    sidebarWeight: getComputedStyle(document.querySelector('#starlight__sidebar .large')).fontWeight,
    leftBorder: getComputedStyle(document.querySelector('.sidebar-pane')).borderInlineEndColor,
    rightBorder: getComputedStyle(document.querySelector('.right-sidebar')).borderInlineStartColor,
    resizer: getComputedStyle(document.querySelector('[data-notes-resizer="left"]'), '::after').backgroundColor,
  }));
  assert.equal(styles.titleSize, '36px');
  assert.equal(styles.bodySize, '15px');
  assert.equal(styles.sidebarWeight, '500');
  assert.equal(styles.leftBorder, 'rgba(0, 0, 0, 0)');
  assert.equal(styles.rightBorder, 'rgba(0, 0, 0, 0)');
  assert.equal(styles.resizer, 'rgba(0, 0, 0, 0)');

  const leftHandle = page.locator('[data-notes-resizer="left"]');
  await leftHandle.hover({ position: { x: 4, y: 40 } });
  await page.waitForTimeout(200);
  assert.notEqual(
    await leftHandle.evaluate((element) => getComputedStyle(element, '::after').backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  await context.close();
});

test('desktop rails collapse independently and persist locally', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/models-overview/`);

  await page.locator('.toggle-left-side-bar-btn').click();
  await page.waitForFunction(() => localStorage.getItem('notes:mainSideBarCollapsed') === 'true');
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('main-side-bar-collapsed')), true);
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('right-side-bar-collapsed')), false);
  assert.equal(await page.locator('#notes-sidebar-sort').isVisible(), false);
  assert.equal(await page.locator('.toggle-left-side-bar-btn').isVisible(), true);
  const leftRail = await page.locator('.sidebar-pane').boundingBox();
  const leftToggle = await page.locator('.toggle-left-side-bar-btn').boundingBox();
  const leftCenterDelta = Math.abs(
    (leftRail.x + (leftRail.width / 2)) - (leftToggle.x + (leftToggle.width / 2)),
  );
  assert.ok(leftCenterDelta <= 1, JSON.stringify({ leftRail, leftToggle, leftCenterDelta }));

  await page.locator('.toggle-right-side-bar-btn').click();
  await page.waitForFunction(() => localStorage.getItem('notes:rightSideBarCollapsed') === 'true');
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('main-side-bar-collapsed')), true);
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('right-side-bar-collapsed')), true);
  const rightRail = await page.locator('.right-sidebar-container').boundingBox();
  const rightToggle = await page.locator('.toggle-right-side-bar-btn').boundingBox();
  const rightCenterDelta = Math.abs(
    (rightRail.x + (rightRail.width / 2)) - (rightToggle.x + (rightToggle.width / 2)),
  );
  assert.ok(rightCenterDelta <= 1, JSON.stringify({ rightRail, rightToggle, rightCenterDelta }));

  await page.reload();
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('main-side-bar-collapsed')), true);
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('right-side-bar-collapsed')), true);

  await page.locator('.toggle-left-side-bar-btn').click();
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('main-side-bar-collapsed')), false);
  assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('right-side-bar-collapsed')), true);
  await context.close();
});

test('mobile keeps Starlight drawers and hides desktop rail controls', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/models-overview/`);
  const mainPane = await page.locator('.main-pane').boundingBox();
  assert.equal(mainPane.x, 0);
  assert.equal(mainPane.width, 390);
  assert.equal(await page.locator('.toggle-left-side-bar-btn').isVisible(), false);
  assert.equal(await page.locator('.toggle-right-side-bar-btn').isVisible(), false);
  assert.equal(await page.locator('#starlight__mobile-toc').isVisible(), true);

  await page.locator('starlight-menu-button button').click();
  assert.equal(await page.locator('body').getAttribute('data-mobile-menu-expanded'), '');
  assert.equal(await page.locator('#starlight__sidebar').isVisible(), true);
  assert.equal(await page.locator('#notes-sidebar-sort').isVisible(), true);
  await page.close();
});

test('note actions copy raw Markdown and the project-relative file path', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => { window.__copiedNoteValue = value; },
      },
    });
  });
  const page = await context.newPage();
  const noteRoute = '/proofs/investigation';
  const notePath = 'docs/proofs/investigation.md';
  const source = fs.readFileSync(path.join(fixtureRoot, 'docs', 'proofs', 'investigation.md'), 'utf8');

  await page.goto(`${baseUrl}${noteRoute}/`);
  const actions = page.locator('[data-note-actions]');
  await actions.locator('[data-note-copy="markdown"]').first().click();
  await page.waitForFunction((expected) => window.__copiedNoteValue === expected, source);
  assert.equal(await actions.locator('[data-note-copy-label]').textContent(), 'Copied Markdown');

  await actions.locator('summary').click();
  await actions.locator('[data-note-copy="path"]').click();
  await page.waitForFunction((expected) => window.__copiedNoteValue === expected, notePath);
  assert.equal(await actions.locator('[data-note-copy-label]').textContent(), 'Copied path');

  const rawPage = await context.newPage();
  const response = await rawPage.goto(`${baseUrl}${noteRoute}.md`);
  assert.equal(response.headers()['content-type'], 'text/plain; charset=utf-8');
  assert.equal(response.headers()['content-disposition'], 'inline');
  assert.equal((await response.body()).toString(), source);
  await context.close();
});

test('Pagefind returns title and body matches but excludes source pages', async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl);

  async function search(query) {
    return page.evaluate(async (value) => {
      const pagefind = await import('/pagefind/pagefind.js');
      await pagefind.init();
      const response = await pagefind.search(value);
      return Promise.all(response.results.slice(0, 10).map(async (result) => {
        const data = await result.data();
        return { title: data.meta.title, url: data.url };
      }));
    }, query);
  }

  const titleResults = await search('Shop models overview');
  assert.ok(titleResults.some((result) => result.title === 'Shop models overview'));
  const bodyResults = await search('wallet_address populated');
  assert.ok(bodyResults.some((result) => result.url === '/topups/notes/'));
  assert.ok([...titleResults, ...bodyResults].every((result) => !result.url.startsWith('/source/')));
  await page.close();
});

test('the search shortcut works in a keyboard layout without the letter k', async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl);

  const pressShortcut = () => page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'л', code: 'KeyK', ctrlKey: true, cancelable: true }));
    return document.querySelector('site-search dialog').open;
  });

  assert.equal(await pressShortcut(), true);
  assert.equal(await pressShortcut(), false);
  await page.close();
});

test('source pages expose line anchors and unavailable paths', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/source/app/models/order.rb/#L13`);
  assert.equal(await page.locator('#L13').count(), 1);
  assert.equal(await page.locator('main').getAttribute('data-pagefind-body'), null);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow,noarchive');

  await page.goto(`${baseUrl}/source/app/reports/wide_report.rb/`);
  const sourceLayout = await page.locator('.source-code pre').evaluate((pre) => {
    const bounds = pre.getBoundingClientRect();
    const rightRail = document.querySelector('.right-sidebar-container')?.getBoundingClientRect();
    pre.scrollLeft = pre.scrollWidth;
    return {
      overflowX: getComputedStyle(pre).overflowX,
      scrollLeft: pre.scrollLeft,
      right: bounds.right,
      rightRailLeft: rightRail?.left,
    };
  });
  assert.equal(sourceLayout.overflowX, 'auto');
  assert.ok(sourceLayout.scrollLeft > 0);
  assert.ok(sourceLayout.rightRailLeft === undefined || sourceLayout.right <= sourceLayout.rightRailLeft);

  await page.goto(`${baseUrl}/source/app/models/legacy_account.rb/`);
  assert.equal(await page.locator('h2').filter({ hasText: 'Unavailable in this checkout' }).count(), 1);
  await page.close();
});
