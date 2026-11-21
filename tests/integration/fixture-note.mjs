import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright-core';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = path.join(packageRoot, 'tests', 'fixture');
const notesRoot = path.join(fixtureRoot, 'docs');
// The server builds into its own folder, so a site that is open on the fixture stays untouched.
const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-dev-'));
process.on('exit', () => fs.rmSync(outRoot, { force: true, recursive: true }));
const fixtureDirectory = path.join(notesRoot, 'zz-fixture');
const fixtureFile = path.join(fixtureDirectory, 'search-fixture.md');
const fixtureRoute = '/zz-fixture/search-fixture/';
const fixtureRawRoute = '/zz-fixture/search-fixture.md';
const fixtureSourceRoute = '/source/app/models/shipment.rb/';
const memoryLimitKb = 500 * 1024;
const testPort = await findFreePort();
const baseUrl = `http://127.0.0.1:${testPort}`;
let server;
let browser;
let serverOutput = '';
let completedUpdates = 0;
let peakTreeKb = 0;
let memorySampler;
let fixtureAdded = false;

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
  const root = path.resolve(expected, '../../..');
  const revisions = fs.readdirSync(root).filter((name) => name.startsWith('chromium-')).sort().reverse();
  return revisions
    .map((revision) => path.join(root, revision, 'chrome-linux64', 'chrome'))
    .find((candidate) => fs.existsSync(candidate));
}

async function waitFor(check, label, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (server && server.exitCode !== null) {
      throw new Error(`The dev server exited early.\n${serverOutput.slice(-4000)}`);
    }
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}.\n${serverOutput.slice(-4000)}`);
}

async function routeStatus(route = '/') {
  try {
    return (await fetch(`${baseUrl}${route}`)).status;
  } catch {
    return 0;
  }
}

function capture(chunk) {
  const text = chunk.toString();
  serverOutput += text;
  completedUpdates = serverOutput.match(/\[notes\] Updated /g)?.length ?? 0;
}

function processTree(pid) {
  const children = fs.readdirSync(`/proc/${pid}/task`, { withFileTypes: true }).flatMap((task) => {
    const list = fs.readFileSync(`/proc/${pid}/task/${task.name}/children`, 'utf8').trim();
    return list ? list.split(' ').map(Number) : [];
  });
  return [pid, ...children.flatMap(processTree)];
}

function residentKb(pid) {
  const match = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+) kB/m);
  return match ? Number(match[1]) : 0;
}

// The dev server and the Pagefind runs it starts must stay under the limit together.
function sampleMemory() {
  try {
    const treeKb = processTree(server.pid).reduce((sum, pid) => sum + residentKb(pid), 0);
    peakTreeKb = Math.max(peakTreeKb, treeKb);
  } catch {
    // A child can exit between listing and reading it.
  }
}

assert.equal(fs.existsSync(fixtureFile), false, `${fixtureFile} already exists`);

try {
  // Runs the dev script the way `notes dev` does, without the wrapper, so the memory check sees only the server.
  server = spawn(process.execPath, ['--max-old-space-size=128', path.join(packageRoot, 'scripts', 'dev.mjs')], {
    cwd: fixtureRoot,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NOTES_PORT: String(testPort), NOTES_OUT: outRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', capture);
  server.stderr.on('data', capture);
  await waitFor(
    async () => serverOutput.includes('[notes] Watching') && await routeStatus() === 200,
    'the dev server',
  );
  memorySampler = setInterval(sampleMemory, 50);

  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.writeFileSync(fixtureFile, `---
title: Dynamic navigation fixture
description: Temporary integration fixture
group: Fixture topic
order: 1
---

The unique Pagefind phrase is quasar plumage 93817. It links [the shipment model](../../app/models/shipment.rb).
`);
  fixtureAdded = true;

  await waitFor(
    async () => completedUpdates >= 1
      && await routeStatus(fixtureRoute) === 200
      && await routeStatus(fixtureRawRoute) === 200,
    'the dev server to add the fixture note',
  );

  const rawResponse = await fetch(`${baseUrl}${fixtureRawRoute}`);
  assert.equal(rawResponse.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(rawResponse.headers.get('content-disposition'), 'inline');
  assert.match(await rawResponse.text(), /quasar plumage 93817/);
  const sourceResponse = await fetch(`${baseUrl}${fixtureSourceRoute}`);
  assert.equal(sourceResponse.status, 200);
  assert.match(await sourceResponse.text(), /<div class="source-code">/);

  browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
  const page = await browser.newPage();
  await page.goto(baseUrl);
  assert.equal(await page.locator('a[data-note-path="zz-fixture/search-fixture.md"]').count(), 1);
  await page.goto(`${baseUrl}${fixtureRoute}`);
  assert.equal(await page.locator('a[aria-current="page"][data-note-path="zz-fixture/search-fixture.md"]').count(), 1);
  const results = await page.evaluate(async () => {
    const pagefind = await import('/pagefind/pagefind.js');
    await pagefind.init();
    const response = await pagefind.search('quasar plumage 93817');
    return Promise.all(response.results.map(async (result) => (await result.data()).url));
  });
  assert.ok(results.includes(fixtureRoute));
  console.log('The running dev server added the fixture to navigation and Pagefind.');
} finally {
  await browser?.close();
  if (fs.existsSync(fixtureFile)) fs.rmSync(fixtureFile);
  try {
    fs.rmdirSync(fixtureDirectory);
  } catch {
    // Preserve the directory if it contains user files.
  }
  if (fixtureAdded && server?.exitCode === null) {
    try {
      await waitFor(
        async () => completedUpdates >= 2
          && await routeStatus(fixtureRoute) === 404
          && await routeStatus(fixtureRawRoute) === 404
          && await routeStatus(fixtureSourceRoute) === 404,
        'the dev server to remove the fixture note',
      );
      clearInterval(memorySampler);
      const serverPeakKb = Number(fs.readFileSync(`/proc/${server.pid}/status`, 'utf8').match(/^VmHWM:\s+(\d+) kB/m)[1]);
      console.log(`Peak memory: dev server ${Math.round(serverPeakKb / 1024)}MB, with its children ${Math.round(peakTreeKb / 1024)}MB.`);
      assert.ok(serverPeakKb < memoryLimitKb, `The dev server peaked at ${serverPeakKb} kB`);
      assert.ok(peakTreeKb < memoryLimitKb, `The dev server and its children peaked at ${peakTreeKb} kB`);
    } finally {
      clearInterval(memorySampler);
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill('SIGTERM');
      await exited;
    }
  } else if (server?.exitCode === null) {
    server.kill('SIGTERM');
  }
}
