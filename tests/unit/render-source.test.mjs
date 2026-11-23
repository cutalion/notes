import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSourceRenderer, fillSourcePage } from '../../scripts/render-source.mjs';
import { ensureShell } from '../../scripts/shell.mjs';

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function sourceEntry(t, contents) {
  const target = path.join(temporaryDirectory(t, 'notes-source-'), 'user.rb');
  fs.writeFileSync(target, contents);
  return { repoRelative: 'app/models/user.rb', target, exists: true };
}

test('renders a linked repository file into the source shell page', { timeout: 300_000 }, async (t) => {
  const { sourceTemplate } = await ensureShell();
  const renderer = await createSourceRenderer({ cacheRoot: temporaryDirectory(t, 'notes-cache-') });
  const entry = sourceEntry(t, 'class User\nend\n');

  const page = fillSourcePage(sourceTemplate, entry, await renderer.render(entry));

  assert.match(page, /<title>user\.rb \| Fixture Notes<\/title>/);
  assert.match(page, /<meta name="description" content="Repository source: app\/models\/user\.rb"\/>/);
  assert.match(page, /<h1 id="_top"[^>]*>user\.rb<\/h1><\/div>/);
  assert.match(page, /<p class="source-path">app\/models\/user\.rb<\/p><div class="source-code"><pre class="shiki/);
  assert.match(page, /<\/pre><button class="notes-code-copy" type="button" aria-label="Copy code"/);
  assert.match(page, /<span class="line" id="L1"><span style="--shiki-light:[^"]+">class<\/span>/);
  assert.doesNotMatch(page, /notes-copy-actions|data-pagefind-body|notes(title|description|toc|content)marker/);
});

test('renders a missing file as unavailable', async (t) => {
  const renderer = await createSourceRenderer({ cacheRoot: temporaryDirectory(t, 'notes-cache-') });

  const html = await renderer.render({ repoRelative: 'gone.rb', target: '/nonexistent/gone.rb', exists: false });

  assert.match(html, /<h2>Unavailable in this checkout<\/h2>/);
});

test('reuses the cached render until the file changes', async (t) => {
  const cacheRoot = temporaryDirectory(t, 'notes-cache-');
  const renderer = await createSourceRenderer({ cacheRoot });
  const entry = sourceEntry(t, 'first = 1\n');

  await renderer.render(entry);
  const cacheFile = path.join(cacheRoot, 'app/models/user.rb.json');
  const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  fs.writeFileSync(cacheFile, JSON.stringify({ ...cached, html: '<p>From cache.</p>' }));
  assert.equal(await renderer.render(entry), '<p>From cache.</p>');

  fs.writeFileSync(entry.target, 'second = 2\n');
  assert.match(await renderer.render(entry), /second/);
});
