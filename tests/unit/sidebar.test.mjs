import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureShell, fillShell } from '../../scripts/shell.mjs';
import { insertSidebar, renderSidebar } from '../../scripts/sidebar.mjs';

function notesFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-sidebar-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const write = (relative, title, mtime) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\ntitle: ${JSON.stringify(title)}\n---\n\nBody.\n`);
    fs.utimesSync(file, mtime, mtime);
  };
  write('index.md', 'Home', 1_000);
  write('alpha/plan.md', '"Alpha" & plan', 3_000);
  write('beta/notes.md', 'Beta notes', 2_000);
  return root;
}

test('renders the sidebar from the shell markup and marks the current note', { timeout: 300_000 }, async (t) => {
  const { template } = await ensureShell();
  const sidebar = renderSidebar(template, notesFixture(t));
  const page = fillShell(template, { title: 'Beta notes', relativePath: 'beta/notes.md', html: '', headings: [] });

  const filled = insertSidebar(page, sidebar, '/beta/notes');

  assert.doesNotMatch(filled, /notes(sidebar|group|item)marker/);
  assert.match(filled, new RegExp(`<sl-sidebar-state-persist data-hash="${sidebar.hash}"`));
  assert.match(filled, /<a href="\/" class="large [^"]+" data-note-title="Home" data-note-group="Notes" data-note-path="index\.md" data-note-updated="1000000"><span[^>]*>Overview<\/span><\/a>/);
  assert.match(filled, /<details class="[^"]+"><summary[^>]*><span class="group-label [^"]+"><span class="large [^"]+">alpha<\/span><\/span><svg[\s\S]*?<\/summary><sl-sidebar-restore data-index="0"><\/sl-sidebar-restore>/);
  assert.match(filled, /data-note-title="&quot;Alpha&quot; &amp; plan"/);
  assert.match(filled, /<details open class="[^"]+"><summary[^>]*><span class="group-label [^"]+"><span class="large [^"]+">beta<\/span>[\s\S]*?data-index="1"/);
  assert.match(filled, /<a href="\/beta\/notes" aria-current="page" class="[^"]+" data-note-title="Beta notes"/);
  assert.equal(filled.match(/aria-current="page"/g).length, 1);
});

test('leaves every group closed on a page that is not in the sidebar', async (t) => {
  const { template } = await ensureShell();
  const sidebar = renderSidebar(template, notesFixture(t));
  const page = fillShell(template, { title: 'Missing', relativePath: 'missing.md', html: '', headings: [] });

  const filled = insertSidebar(page, sidebar, '/missing');

  assert.doesNotMatch(filled, /aria-current="page"|<details open/);
});
