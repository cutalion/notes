import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureShell, fillShell } from '../../scripts/shell.mjs';

test('fills the Starlight shell with one note', { timeout: 300_000 }, async () => {
  const { template } = await ensureShell();

  const page = fillShell(template, {
    title: 'Fees & limits',
    relativePath: 'topic/fee note.md',
    html: '<p>Body text.</p>',
    headings: [
      { depth: 2, slug: 'setup', text: 'Setup' },
      { depth: 3, slug: 'keys', text: 'Keys <and> secrets' },
      { depth: 4, slug: 'too-deep', text: 'Too deep' },
      { depth: 2, slug: 'usage', text: 'Usage' },
    ],
  });

  assert.doesNotMatch(page, /notes(title|description|toc|content|path|projectpath|rawurl)marker/);
  assert.match(page, /<title>Fees &amp; limits \| Fixture Notes<\/title>/);
  assert.match(page, /<h1 id="_top"[^>]*>Fees &amp; limits<\/h1>/);
  assert.match(page, /<meta name="description" content="Notes for the tests"\/>/);
  assert.match(page, /data-note-raw-url="\/topic\/fee%20note\.md" data-note-project-path="docs\/topic\/fee note\.md"/);
  assert.match(page, /<div class="sl-markdown-content"><p>Body text\.<\/p>\s*<\/div>/);
  assert.match(page, /href="#setup"[^>]*><span[^>]*>Setup<\/span><\/a><ul class="[^"]*" style="--depth: 1;"><li[^>]*><a href="#keys"[^>]*><span[^>]*>Keys &lt;and&gt; secrets<\/span><\/a><\/li><\/ul><\/li>/);
  assert.match(page, /<ul class="isMobile [^"]+" style="--depth: 1;"><li[^>]*><a href="#keys"/);
  assert.match(page, /href="#usage"/);
  assert.doesNotMatch(page, /too-deep/);
});

test('nests a leading third-level heading under Overview, as Starlight does', async () => {
  const { template } = await ensureShell();

  const page = fillShell(template, {
    title: 'Note',
    relativePath: 'note.md',
    html: '',
    headings: [{ depth: 3, slug: 'intro', text: 'Intro' }],
  });

  assert.match(page, /<a href="#_top"[^>]*><span[^>]*>Overview<\/span><\/a><ul class="[^"]*" style="--depth: 1;"><li[^>]*><a href="#intro"/);
});

test('falls back to the site description and keeps the note description', async () => {
  const { template } = await ensureShell();

  const page = fillShell(template, {
    title: 'Note',
    description: 'What "this" covers',
    relativePath: 'note.md',
    html: '',
    headings: [],
  });

  assert.match(page, /<meta name="description" content="What &quot;this&quot; covers"\/>/);
});
