import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import { removeNotePage, writeNotePage } from '../../scripts/pages.mjs';
import { createNoteRenderer } from '../../scripts/render-note.mjs';
import { buildSearchIndex, currentSearchDir } from '../../scripts/search-index.mjs';
import { ensureShell } from '../../scripts/shell.mjs';

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function indexedPages(dir) {
  const fragments = path.join(dir, 'fragment');
  return fs.readdirSync(fragments).map((name) => {
    const fragment = zlib.gunzipSync(fs.readFileSync(path.join(fragments, name)));
    return JSON.parse(fragment.subarray('pagefind_dcd'.length).toString());
  });
}

test('indexes the note pages on disk and switches to the new index', { timeout: 300_000 }, async (t) => {
  const root = temporaryDirectory(t, 'notes-root-');
  fs.writeFileSync(path.join(root, 'index.md'), '---\ntitle: Home\n---\n\nWelcome.\n');
  fs.mkdirSync(path.join(root, 'topic'));
  const noteFile = path.join(root, 'topic', 'note.md');
  fs.writeFileSync(noteFile, '---\ntitle: Fixture\n---\n\nThe phrase is quasar plumage.\n');
  const pagesRoot = temporaryDirectory(t, 'notes-pages-');
  const searchRoot = temporaryDirectory(t, 'notes-search-');
  const { template } = await ensureShell();
  const renderer = await createNoteRenderer({ root, cacheRoot: temporaryDirectory(t, 'notes-cache-') });
  for (const file of [path.join(root, 'index.md'), noteFile]) {
    await writeNotePage({ file, root, renderer, template, pagesRoot });
  }
  assert.match(fs.readFileSync(path.join(pagesRoot, 'topic', 'note', 'index.html'), 'utf8'), /<h1 id="_top"[^>]*>Fixture<\/h1>/);

  const first = await buildSearchIndex({ pagesRoot, searchRoot });
  assert.equal(currentSearchDir(searchRoot), first);
  const pages = indexedPages(first);
  assert.deepEqual(pages.map((page) => page.url).sort(), ['/', '/topic/note/']);
  assert.match(pages.find((page) => page.url === '/topic/note/').content, /quasar plumage/);
  assert.ok(fs.existsSync(path.join(first, 'pagefind.js')));

  removeNotePage(pagesRoot, '/topic/note');
  assert.equal(fs.existsSync(path.join(pagesRoot, 'topic', 'note')), false);
  const second = await buildSearchIndex({ pagesRoot, searchRoot });
  assert.equal(currentSearchDir(searchRoot), second);
  assert.deepEqual(indexedPages(second).map((page) => page.url), ['/']);
});
