import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { notePageFile, removeNotePage, writeHomePage } from '../../scripts/pages.mjs';
import { ensureShell } from '../../scripts/shell.mjs';

function temporaryFolder(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-pages-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('a folder without index.md gets a home page that lists its notes', { timeout: 300_000 }, async (t) => {
  const { template } = await ensureShell();
  const root = temporaryFolder(t);
  const pagesRoot = temporaryFolder(t);
  write(root, 'setup.md', '# Set up <the> tool\n\nBody text.\n');
  write(root, 'payments/refunds.md', 'Body text.\n');

  const file = writeHomePage({ root, template, pagesRoot });
  const page = fs.readFileSync(file, 'utf8');

  assert.equal(file, notePageFile(pagesRoot, '/'));
  assert.match(page, /<h1 id="_top"[^>]*>Fixture Notes<\/h1><\/div><script/);
  assert.match(page, /<h2 id="group-\d">Notes<\/h2><ul><li><a href="\/setup">Set up &lt;the&gt; tool<\/a><\/li><\/ul>/);
  assert.match(page, /<h2 id="group-\d">payments<\/h2><ul><li><a href="\/payments\/refunds">refunds<\/a><\/li><\/ul>/);
  assert.doesNotMatch(page, /notes-copy-actions |notes(title|description|toc|content|path|projectpath|rawurl)marker/);
});

test('a folder with index.md keeps its own home page', { timeout: 300_000 }, async (t) => {
  const { template } = await ensureShell();
  const root = temporaryFolder(t);
  const pagesRoot = temporaryFolder(t);
  write(root, 'index.md', 'Welcome.\n');

  assert.equal(writeHomePage({ root, template, pagesRoot }), undefined);
  assert.deepEqual(fs.readdirSync(pagesRoot), []);
});

test('removing a page keeps the pages of deeper notes', (t) => {
  const pagesRoot = temporaryFolder(t);
  write(pagesRoot, 'index.html', 'home');
  write(pagesRoot, 'topic/index.html', 'topic');
  write(pagesRoot, 'topic/deep/index.html', 'deep');

  removeNotePage(pagesRoot, '/');
  removeNotePage(pagesRoot, '/topic');
  assert.deepEqual(fs.readdirSync(pagesRoot, { recursive: true }).sort(), ['topic', 'topic/deep', 'topic/deep/index.html']);

  removeNotePage(pagesRoot, '/topic/deep');
  assert.deepEqual(fs.readdirSync(path.join(pagesRoot, 'topic')), []);
});
