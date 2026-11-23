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
  const block = page.locator('.mermaid-block').first();
  assert.equal(await block.locator('.mermaid-header .mermaid-tools button').count(), 5);
  assert.equal(await block.locator('.mermaid-caption').textContent(), 'Diagram');

  const viewport = block.locator('.mermaid-viewport');
  const controlBoxes = await block.locator('.mermaid-tools button').evaluateAll((buttons) => (
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { height: box.height, top: box.top };
    })
  ));
  assert.equal(new Set(controlBoxes.map(({ height }) => height)).size, 1);
  assert.equal(new Set(controlBoxes.map(({ top }) => top)).size, 1);
  await block.locator('[data-mermaid-action="in"]').click();
  assert.equal(await viewport.evaluate((element) => element.classList.contains('is-zoomed')), true);
  assert.equal(await viewport.evaluate((element) => getComputedStyle(element).userSelect), 'none');
  assert.notEqual(
    await viewport.locator('.mermaid-pane').evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  );
  await block.locator('[data-mermaid-action="reset"]').click();
  assert.equal(await viewport.evaluate((element) => element.classList.contains('is-zoomed')), false);
  await block.evaluate((element) => {
    element.requestFullscreen = async () => { element.dataset.fullscreenRequested = 'true'; };
  });
  await block.locator('[data-mermaid-action="fullscreen"]').click();
  assert.equal(await block.getAttribute('data-fullscreen-requested'), 'true');
  const fullscreenWheelZoomed = await block.evaluate((element) => {
    const area = element.querySelector('.mermaid-viewport');
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
    area.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    return area.classList.contains('is-zoomed');
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
  // The switch of the theme draws the diagram again. Wait for a picture that has its colours.
  await page.waitForFunction(() => {
    const shape = document.querySelector('pre.mermaid .node.service :is(rect, polygon, circle, ellipse, path)');
    return shape && /\d/.test(getComputedStyle(shape).fill);
  });
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

test('desktop sizes every text from the note text and keeps the column readable', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/proofs/investigation/`);
  await page.locator('[data-notes-resizer="right"]').waitFor();

  const styles = await page.evaluate(() => {
    const size = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const column = box('.sl-markdown-content');
    return {
      body: size('.sl-markdown-content p'),
      title: size('h1'),
      folder: size('#starlight__sidebar .large'),
      note: size('#starlight__sidebar ul ul a'),
      contents: size('starlight-toc a'),
      control: size('header .notes-copy-primary'),
      folderWeight: getComputedStyle(document.querySelector('#starlight__sidebar .large')).fontWeight,
      column: column.width,
      columnCenter: column.left + (column.width / 2),
      tree: box('.sidebar-pane').width,
      contentsLeft: box('.right-sidebar-container').left,
      contentsWidth: box('.right-sidebar-container').width,
      header: box('header').height,
      controlHeights: [...document.querySelectorAll('header .notes-panel-toggle, header site-search button[data-open-modal], header select, header .notes-width, header .notes-copy-control')]
        .map((control) => Math.round(control.getBoundingClientRect().height)),
      treeBorder: getComputedStyle(document.querySelector('.sidebar-pane')).borderInlineEndColor,
      resizer: getComputedStyle(document.querySelector('[data-notes-resizer="left"]'), '::after').backgroundColor,
    };
  });
  assert.equal(styles.title, styles.body * 2);
  assert.equal(styles.folder, styles.body * 0.875);
  assert.equal(styles.note, styles.folder);
  assert.equal(styles.contents, styles.folder);
  assert.equal(styles.control, styles.body * 0.75);
  assert.equal(styles.folderWeight, '600');
  // The column is set by the length of the line, and the two panels together stay narrower.
  assert.equal(styles.column, styles.body * 38);
  assert.ok(styles.tree + styles.contentsWidth < styles.column);
  assert.ok(Math.abs(styles.columnCenter - ((styles.tree + styles.contentsLeft) / 2)) <= 1, JSON.stringify(styles));
  assert.equal(styles.header, styles.body * 3);
  assert.equal(new Set(styles.controlHeights).size, 1, JSON.stringify(styles.controlHeights));
  // The border of a panel is a plain line. The drag handle over it stays invisible.
  assert.notEqual(styles.treeBorder, 'rgba(0, 0, 0, 0)');
  assert.equal(styles.resizer, 'rgba(0, 0, 0, 0)');

  // A wider window adds margin around the column and leaves the lines as long as they were.
  await page.setViewportSize({ width: 1900, height: 900 });
  assert.equal(await page.locator('.sl-markdown-content').evaluate((element) => element.getBoundingClientRect().width), styles.column);

  // A long name takes two lines in the tree, and the tooltip holds the whole name.
  const current = page.locator('#starlight__sidebar a[aria-current="page"]');
  assert.equal(await current.getAttribute('title'), 'Proof of payment investigation');
  assert.equal(await current.locator('span').evaluate((label) => getComputedStyle(label).webkitLineClamp), '2');
  await context.close();
});

test('the width button moves the text column through three widths, and the choice persists', async () => {
  const context = await browser.newContext({ viewport: { width: 1900, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/guide/order-lifecycle/`);
  const button = page.locator('[data-notes-width-switch]');
  await button.waitFor();
  const label = button.locator('[data-notes-width-label]');
  const columnWidth = () => page.locator('.sl-markdown-content').evaluate((element) => element.getBoundingClientRect().width);
  const text = await page.locator('.sl-markdown-content p').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const between = await page.locator('.main-pane').evaluate((element) => element.getBoundingClientRect().width);

  assert.equal(await label.innerText(), 'Regular');
  assert.equal(await columnWidth(), text * 38);

  await button.click();
  assert.equal(await label.innerText(), 'Wide');
  assert.equal(await page.locator('html').getAttribute('data-notes-width'), 'wide');
  assert.equal(await columnWidth(), text * 38 * 1.25);
  // The panels keep their width: they are measured by the regular column.
  assert.ok(await page.locator('.sidebar-pane').evaluate((element) => element.getBoundingClientRect().width) < text * 38 / 2);

  // The full column takes all the space between the panels, but for its side margins.
  await button.click();
  assert.equal(await label.innerText(), 'Full width');
  const full = await columnWidth();
  assert.ok(full > text * 38 * 1.25 && full <= between, `${full} of ${between}`);
  assert.ok(full > between - text * 14, `${full} of ${between}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.reload();
  assert.equal(await label.innerText(), 'Full width');
  assert.equal(await columnWidth(), full);

  // The click after the last width returns to the first one. The keyboard reaches the button too.
  await button.focus();
  await page.keyboard.press('Enter');
  assert.equal(await label.innerText(), 'Regular');
  assert.equal(await page.locator('html').getAttribute('data-notes-width'), null);
  assert.equal(await columnWidth(), text * 38);
  await context.close();
});

test('paragraphs stand three steps apart, and the broken lines of one paragraph a step apart', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/guide/order-lifecycle/`);
  const spaces = await page.evaluate(() => {
    const content = document.querySelector('.sl-markdown-content');
    const first = content.querySelector(':scope > p');
    return {
      text: parseFloat(getComputedStyle(first).fontSize),
      paragraphs: first.nextElementSibling.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
      lines: content.querySelector('.notes-break').getBoundingClientRect().height,
    };
  });
  assert.equal(spaces.paragraphs, spaces.text * 1.5);
  assert.equal(spaces.lines, spaces.text * 0.5);
  await page.close();
});

test('a wide table or diagram grows into the margins, and scrolls only past them', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/guide/order-lifecycle/`);
  await page.locator('.sl-markdown-content > table[data-scroll]').waitFor();
  await page.locator('.mermaid-block[data-wide]').first().waitFor();

  const measure = () => page.evaluate(() => {
    const column = document.querySelector('.sl-markdown-content').getBoundingClientRect();
    const pane = document.querySelector('.main-pane').getBoundingClientRect();
    const describe = (element) => {
      const box = element.getBoundingClientRect();
      return {
        wide: 'wide' in element.dataset,
        scroll: 'scroll' in element.dataset,
        width: Math.round(box.width),
        center: box.left + (box.width / 2),
        inPane: box.left >= pane.left && box.right <= pane.right,
        overflows: element.scrollWidth > element.clientWidth,
      };
    };
    return {
      column: Math.round(column.width),
      columnCenter: column.left + (column.width / 2),
      pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
      tables: [...document.querySelectorAll('.sl-markdown-content > table')].map(describe),
      diagrams: [...document.querySelectorAll('.sl-markdown-content > .mermaid-block')].map(describe),
      sticky: getComputedStyle(document.querySelector('table[data-scroll] td')).position,
      tableText: parseFloat(getComputedStyle(document.querySelector('.sl-markdown-content td')).fontSize),
      text: parseFloat(getComputedStyle(document.querySelector('.sl-markdown-content p')).fontSize),
    };
  });

  // The header of a diagram shows its title, from the front matter or from `accTitle`, and the
  // picture does not repeat it. A diagram without a title is just a diagram.
  const captions = await page.locator('.mermaid-caption').allTextContents();
  assert.deepEqual(captions.slice(0, 3), ['The four steps of an order', 'Diagram', 'From the order to the receipt']);
  assert.equal(await page.locator('.mermaid-block').first().locator('svg text, svg foreignObject').filter({ hasText: 'The four steps' }).count(), 0);

  const desktop = await measure();
  const [fits, wrapped, inMargins, scrolls] = desktop.tables;
  assert.equal(desktop.tableText, desktop.text * 0.875);
  // Prose wraps, so these two stay in the column.
  for (const table of [fits, wrapped]) {
    assert.deepEqual([table.wide, table.width, table.overflows], [false, desktop.column, false], JSON.stringify(table));
  }
  // Code does not wrap. The table takes the margins, shows everything, and stays centred.
  assert.ok(inMargins.wide && !inMargins.scroll && !inMargins.overflows, JSON.stringify(inMargins));
  assert.ok(inMargins.width > desktop.column && inMargins.inPane, JSON.stringify(inMargins));
  assert.ok(Math.abs(inMargins.center - desktop.columnCenter) <= 1, JSON.stringify(inMargins));
  // The widest table takes all the margins and scrolls inside itself, with the first column fixed.
  assert.ok(scrolls.scroll && scrolls.overflows && scrolls.inPane, JSON.stringify(scrolls));
  assert.ok(scrolls.width > inMargins.width);
  assert.equal(desktop.sticky, 'sticky');
  assert.equal(await page.locator('table[data-scroll]').getAttribute('tabindex'), '0');
  // Small diagrams stay in the column, large ones step out of it. The page never scrolls sideways.
  assert.ok(desktop.diagrams.some((diagram) => !diagram.wide && diagram.width === desktop.column));
  for (const diagram of desktop.diagrams.filter((diagram) => diagram.wide)) {
    assert.ok(diagram.width > desktop.column && diagram.inPane, JSON.stringify(diagram));
    assert.ok(Math.abs(diagram.center - desktop.columnCenter) <= 1, JSON.stringify(diagram));
  }
  assert.equal(desktop.pageScrolls, false);

  // A phone has no margins: every block keeps the width of the column, and wide tables scroll.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForFunction(() => document.querySelectorAll('.sl-markdown-content > table[data-scroll]').length > 1);
  const phone = await measure();
  for (const block of [...phone.tables, ...phone.diagrams]) {
    assert.equal(block.width, phone.column, JSON.stringify(block));
  }
  assert.equal(phone.pageScrolls, false);
  await context.close();
});

test('a heading folds its section, the choice persists, and a link opens the section again', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/guide/order-lifecycle/`);
  const fold = (id) => page.locator(`.sl-heading-wrapper:has(#${id}) .notes-fold`);
  const visible = (id) => page.locator(`#${id}`).isVisible();
  await fold('checkout').waitFor({ state: 'attached' });
  // A diagram that is drawn moves the text below it, and the pointer must stay on the heading.
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-block').length === document.querySelectorAll('pre.mermaid').length);

  // The mark hangs in the margin, to the left of the edge of the text, and shows on hover.
  const heading = page.locator('.sl-heading-wrapper:has(#checkout)');
  assert.equal(await fold('checkout').evaluate((button) => getComputedStyle(button).opacity), '0');
  await heading.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.sl-heading-wrapper:has(#checkout) .notes-fold')).opacity === '1');
  const edges = await heading.evaluate((wrapper) => [
    wrapper.querySelector('.notes-fold').getBoundingClientRect().right,
    wrapper.querySelector('h2').getBoundingClientRect().left,
  ]);
  assert.ok(edges[0] <= edges[1], JSON.stringify(edges));

  // A folded section hides its text and its subsections, and nothing of the next section.
  await fold('checkout').click();
  assert.equal(await fold('checkout').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(
    await Promise.all(['checkout', 'validation', 'stock-reservation', 'payment'].map(visible)),
    [true, false, false, true],
  );
  assert.equal(await fold('checkout').evaluate((button) => getComputedStyle(button).opacity), '1');

  // A subsection folds on its own, and stays folded when the section around it opens again.
  await fold('authorization').click();
  assert.deepEqual(await Promise.all(['authorization', 'capture'].map(visible)), [true, true]);
  assert.equal(await page.locator('.sl-heading-wrapper:has(#authorization) + *').isVisible(), false);

  await page.reload();
  await fold('checkout').waitFor({ state: 'attached' });
  assert.equal(await visible('validation'), false);
  assert.equal(await fold('authorization').getAttribute('aria-expanded'), 'false');

  // The contents lead into the folded section, so the section opens.
  await page.locator('starlight-toc a[href="#stock-reservation"]').click();
  await page.waitForFunction(() => document.querySelector('#stock-reservation').getClientRects().length > 0);
  assert.equal(await fold('checkout').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.sl-markdown-content > table').first().isVisible(), true);

  // With Alt the mark folds every section of its level.
  await fold('payment').click({ modifiers: ['Alt'] });
  assert.deepEqual(await Promise.all(['checkout', 'validation', 'shipping', 'carriers'].map(visible)), [true, false, true, false]);
  await fold('payment').click({ modifiers: ['Alt'] });
  assert.equal(await page.locator('.sl-markdown-content > [data-notes-folded]:not(.sl-heading-wrapper:has(#authorization) ~ *)').count(), 0);
  await context.close();
});

test('the header buttons pin the tree and hide the contents, and the choice persists', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/models-overview/`);

  const root = page.locator('html');
  const tree = page.locator('.sidebar-pane');
  const treeToggle = page.locator('[data-notes-toggle="tree"]');
  const tocToggle = page.locator('[data-notes-toggle="toc"]');
  const mainLeft = () => page.locator('.main-frame').evaluate((frame) => parseFloat(getComputedStyle(frame).paddingInlineStart));

  // The tree button is the first control of the header, the contents button the last one.
  const headerControls = await page.locator('header :is(button, a, select)').evaluateAll((controls) => (
    controls.filter((control) => control.getBoundingClientRect().width > 0).map((control) => control.dataset.notesToggle ?? control.tagName)
  ));
  assert.equal(headerControls.at(0), 'tree');
  assert.equal(headerControls.at(-1), 'toc');

  assert.equal(await treeToggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await tree.isVisible(), true);
  assert.ok(await mainLeft() > 0);

  await treeToggle.click();
  assert.equal(await root.getAttribute('data-notes-tree'), 'unpinned');
  assert.equal(await treeToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('notes:mainSideBarCollapsed')), 'true');
  assert.equal(await mainLeft(), 0);
  assert.equal(await page.locator('[data-notes-resizer="left"]').isVisible(), false);

  // The click left the pointer on the button, so move away and let the tree go.
  await page.mouse.move(700, 500);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar-pane')).visibility === 'hidden');

  // The unpinned tree floats over the note while the pointer is on the button or on the tree.
  const columnLeft = await page.locator('.sl-markdown-content').evaluate((element) => element.getBoundingClientRect().left);
  await treeToggle.hover();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-notes-peek'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar-pane')).opacity === '1');
  assert.equal(await tree.isVisible(), true);
  assert.equal(await page.locator('.sl-markdown-content').evaluate((element) => element.getBoundingClientRect().left), columnLeft);
  await page.locator('#notes-sidebar-sort').hover();
  await page.waitForTimeout(400);
  assert.equal(await root.getAttribute('data-notes-peek'), '');
  await page.keyboard.press('Escape');
  assert.equal(await root.getAttribute('data-notes-peek'), null);
  await page.mouse.move(700, 500);

  await tocToggle.click();
  assert.equal(await root.getAttribute('data-notes-toc'), 'hidden');
  assert.equal(await tocToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('notes:rightSideBarCollapsed')), 'true');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.right-sidebar')).visibility === 'hidden');
  assert.equal(await page.locator('.right-sidebar-container').evaluate((element) => element.getBoundingClientRect().width), 0);
  assert.equal(await tocToggle.isVisible(), true);

  // Unpinned contents float in the same way, from their own button.
  await page.mouse.move(700, 500);
  await tocToggle.hover();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-notes-toc-peek'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.right-sidebar')).opacity === '1');
  assert.equal(await page.locator('starlight-toc a').first().isVisible(), true);
  await page.mouse.move(700, 500);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-notes-toc-peek'));

  await page.reload();
  assert.equal(await root.getAttribute('data-notes-tree'), 'unpinned');
  assert.equal(await root.getAttribute('data-notes-toc'), 'hidden');
  assert.equal(await treeToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.right-sidebar').isVisible(), false);

  // The keyboard reaches the same button: Enter pins the tree back.
  await treeToggle.focus();
  await page.keyboard.press('Enter');
  assert.equal(await root.getAttribute('data-notes-tree'), null);
  assert.equal(await tree.isVisible(), true);
  assert.ok(await mainLeft() > 0);
  assert.equal(await root.getAttribute('data-notes-toc'), 'hidden');
  await context.close();
});

test('mobile keeps Starlight drawers and hides the panel buttons', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/models-overview/`);
  const mainPane = await page.locator('.main-pane').boundingBox();
  assert.equal(mainPane.x, 0);
  assert.equal(mainPane.width, 390);
  assert.equal(await page.locator('[data-notes-toggle="tree"]').isVisible(), false);
  assert.equal(await page.locator('[data-notes-toggle="toc"]').isVisible(), false);
  // The theme switch has one place on each screen: on a phone it is in the menu.
  assert.equal(await page.locator('header starlight-theme-select').isVisible(), false);
  const margin = await page.locator('.sl-markdown-content').evaluate((element) => {
    const text = getComputedStyle(element.querySelector('p'));
    return { left: element.getBoundingClientRect().left, line: parseFloat(text.lineHeight) };
  });
  assert.ok(Math.round(margin.left) >= Math.round(margin.line), JSON.stringify(margin));
  assert.equal(await page.locator('#starlight__mobile-toc').isVisible(), true);

  await page.locator('starlight-menu-button button').click();
  assert.equal(await page.locator('body').getAttribute('data-mobile-menu-expanded'), '');
  assert.equal(await page.locator('#starlight__sidebar').isVisible(), true);
  assert.equal(await page.locator('#notes-sidebar-sort').isVisible(), true);
  await page.close();
});

test('a diagram folds to its header, the choice persists, and its source is copied in its code fence', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => { window.__copiedDiagram = value; },
      },
    });
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/guide/order-lifecycle/`);
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-block').length === document.querySelectorAll('pre.mermaid').length);
  const block = page.locator('.mermaid-block').nth(2);
  const fold = block.locator('.mermaid-fold');
  const copy = block.locator('[data-mermaid-action="copy"]');
  await block.and(page.locator('[data-wide]')).waitFor();
  const column = await page.locator('.sl-markdown-content').evaluate((element) => element.getBoundingClientRect().width);

  // The caption folds the diagram. The picture and the zoom leave, the copy button stays, and
  // the header of a diagram that stood in the margins returns to the column.
  await fold.click();
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  assert.equal(await block.locator('.mermaid-viewport').isVisible(), false);
  assert.equal(await block.locator('[data-mermaid-action="in"]').isVisible(), false);
  assert.equal(await copy.isVisible(), true);
  assert.equal(await block.evaluate((element) => element.getBoundingClientRect().width), column);
  assert.equal(await page.locator('.mermaid-block').nth(1).locator('.mermaid-viewport').isVisible(), true);

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-block').length === document.querySelectorAll('pre.mermaid').length);
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  assert.equal(await block.locator('.mermaid-viewport').isVisible(), false);

  // An unfolded diagram measures itself again: it is back in the margins with a picture of a size.
  await fold.click();
  await block.and(page.locator('[data-wide]')).waitFor();
  const picture = await block.locator('pre.mermaid svg').boundingBox();
  assert.ok(picture.width > column / 2 && picture.height > 100, JSON.stringify(picture));
  assert.equal(await page.evaluate(() => localStorage.getItem(`notes:foldedDiagrams:${location.pathname}`)), null);

  // The copied source stands in its code fence, with the title that the build moved into the header.
  await page.locator('.mermaid-block').first().locator('[data-mermaid-action="copy"]').click();
  await page.waitForFunction(() => window.__copiedDiagram === '```mermaid\n---\ntitle: The four steps of an order\n---\nflowchart LR\n  Cart --> Order --> Payment --> Shipment\n```');
  await page.locator('.mermaid-block').first().locator('[data-mermaid-action="copy"][data-copied]').waitFor();
  await page.locator('.mermaid-block').nth(1).locator('[data-mermaid-action="copy"]').click();
  await page.waitForFunction(() => window.__copiedDiagram.startsWith('```mermaid\nsequenceDiagram\n  participant Worker') && window.__copiedDiagram.endsWith('authorization id\n```'));
  await context.close();
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
  const actions = page.locator('header [data-note-actions]');
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

test('a source page copies the file as it is on disk', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => { window.__copiedSource = value; },
      },
    });
  });
  const page = await context.newPage();
  const source = fs.readFileSync(path.join(fixtureRoot, 'app', 'models', 'order.rb'), 'utf8');
  await page.goto(`${baseUrl}/source/app/models/order.rb/`);

  // The button is quiet, as in a code block of a note: it shows when the pointer is on the file.
  const copy = page.locator('.source-code .notes-code-copy');
  assert.equal(await copy.evaluate((button) => getComputedStyle(button).opacity), '0');
  await page.locator('.source-code pre').hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.source-code .notes-code-copy')).opacity === '1');

  await copy.click();
  await page.waitForFunction((expected) => window.__copiedSource === expected, source);
  await page.locator('.source-code .notes-code-copy[data-copied]').waitFor();
  await context.close();
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
