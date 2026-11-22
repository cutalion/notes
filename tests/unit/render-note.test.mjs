import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createNoteRenderer, mermaidTitle } from '../../scripts/render-note.mjs';

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

const source = `---
title: Renderer fixture
---

## Setup steps

:::caution
Mind the gap.
:::

\`\`\`ruby
puts 'hello'
\`\`\`

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`;

test('takes the title of a diagram out of its source', () => {
  assert.deepEqual(
    mermaidTitle('---\ntitle: "Order steps"\n---\nflowchart LR\n  A --> B'),
    { title: 'Order steps', code: 'flowchart LR\n  A --> B' },
  );
  // The rest of the front matter stays for Mermaid.
  assert.deepEqual(
    mermaidTitle('---\ntitle: Order steps\nconfig:\n  look: classic\n---\nflowchart LR\n  A --> B'),
    { title: 'Order steps', code: '---\nconfig:\n  look: classic\n---\nflowchart LR\n  A --> B' },
  );
  // An accessible title is not drawn in the picture, so the source keeps it.
  const sequence = 'sequenceDiagram\n  accTitle: Capture\n  A->>B: capture';
  assert.deepEqual(mermaidTitle(sequence), { title: 'Capture', code: sequence });
  assert.deepEqual(mermaidTitle('flowchart LR\n  A --> B'), { title: '', code: 'flowchart LR\n  A --> B' });
});

test('renders a note body with Starlight asides, heading links, highlighted code and mermaid', async (t) => {
  const root = temporaryDirectory(t, 'notes-root-');
  const file = path.join(root, 'topic', 'note.md');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, source);
  const renderer = await createNoteRenderer({ root, cacheRoot: temporaryDirectory(t, 'notes-cache-') });

  const { html, headings } = await renderer.render(file);

  assert.deepEqual(headings, [{ depth: 2, slug: 'setup-steps', text: 'Setup steps' }]);
  assert.match(html, /<h2 id="setup-steps">Setup steps<\/h2>/);
  assert.match(html, /class="sl-anchor-link" href="#setup-steps"/);
  assert.match(html, /<aside aria-label="Caution" class="starlight-aside starlight-aside--caution">/);
  assert.match(html, /<div class="notes-code"><pre class="shiki shiki-themes github-light-high-contrast github-dark-default"/);
  assert.match(html, /<button class="notes-code-copy" type="button"/);
  assert.match(html, /<pre class="mermaid">flowchart LR\n  A --> B<\/pre>/);
  assert.doesNotMatch(html, /Renderer fixture/);
});

test('reuses the cached render until the note changes', async (t) => {
  const root = temporaryDirectory(t, 'notes-root-');
  const cacheRoot = temporaryDirectory(t, 'notes-cache-');
  const file = path.join(root, 'note.md');
  fs.writeFileSync(file, '---\ntitle: Cached\n---\n\nFirst version.\n');
  const renderer = await createNoteRenderer({ root, cacheRoot });

  await renderer.render(file);
  const cacheFile = path.join(cacheRoot, 'note.md.json');
  const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  fs.writeFileSync(cacheFile, JSON.stringify({ ...cached, html: '<p>From cache.</p>' }));
  assert.equal((await renderer.render(file)).html, '<p>From cache.</p>');

  fs.writeFileSync(file, '---\ntitle: Cached\n---\n\nSecond version.\n');
  assert.match((await renderer.render(file)).html, /Second version\./);
});

test('a line break inside a paragraph is followed by a gap, and a break in a table cell is not', async (t) => {
  const root = temporaryDirectory(t, 'notes-root-');
  const cacheRoot = temporaryDirectory(t, 'notes-cache-');
  const file = path.join(root, 'note.md');
  fs.writeFileSync(file, '---\ntitle: Breaks\n---\n\nFirst thought.\nSecond thought.\n\n| A |\n| --- |\n| one<br>two |\n');
  const renderer = await createNoteRenderer({ root, cacheRoot });

  const { html } = await renderer.render(file);
  assert.match(html, /First thought\.<br><span class="notes-break"><\/span>\s*Second thought\./);
  assert.match(html, /one<br>two/);
});
