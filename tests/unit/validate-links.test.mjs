import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateLinks } from '../../scripts/validate-links.mjs';

function siteFixture(t, noteHtml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-links-check-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const write = (relative, contents = 'fixture') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  write('repo/team/docs/topic/note.md');
  write('repo/team/docs/topic/chart.png');
  write('repo/app/user.rb', 'class User\nend');
  write('shell/_astro/page.css');
  write('pages/index.html', '<h2 id="start">Start</h2>');
  write('pages/topic/note/index.html', noteHtml);

  return {
    index: {
      notes: {
        'index.md': { attachments: [], sources: [] },
        'topic/note.md': {
          attachments: ['team/docs/topic/chart.png', 'team/docs/topic/gone.png'],
          sources: ['app/user.rb', 'app/gone.rb'],
        },
      },
    },
    sidebar: { html: '', hash: '' },
    shellRoot: path.join(root, 'shell'),
    pagesRoot: path.join(root, 'pages'),
    searchDir: undefined,
    roots: { repoRoot: path.join(root, 'repo'), notesRoot: path.join(root, 'repo', 'team', 'docs') },
  };
}

test('accepts every link that the site serves', (t) => {
  const site = siteFixture(t, `
    <link href="/_astro/page.css" rel="stylesheet">
    <h2 id="details">Details</h2>
    <a href="#details">Here</a>
    <a href="/#start">Home</a>
    <a href="/topic/note.md">Raw</a>
    <a href="/source/app/user.rb/#L1-L2">Model</a>
    <a href="/source/app/gone.rb/#L40">A file from another branch</a>
    <a href="https://example.com/missing">External</a>
    <code>&lt;script src="/missing.js"&gt;</code>
    <img src="/attachments/team/docs/topic/chart.png">
  `);

  assert.deepEqual(validateLinks(site), { pages: 2, checked: 7, failures: [] });
});

test('reports a link that the site does not serve', (t) => {
  const site = siteFixture(t, `
    <a href="/topic/other/">A note that is gone</a>
    <a href="/source/app/account.rb/">A file no note links</a>
    <img src="/attachments/team/docs/topic/gone.png">
  `);

  assert.deepEqual(validateLinks(site).failures, [
    'topic/note: missing target /topic/other/',
    'topic/note: missing target /source/app/account.rb/',
    'topic/note: missing target /attachments/team/docs/topic/gone.png',
  ]);
});

test('reports an anchor that the target does not have', (t) => {
  const site = siteFixture(t, `
    <a href="/#finish">A heading that is gone</a>
    <a href="/source/app/user.rb/#L3">A line past the end</a>
    <a href="/source/app/user.rb/#L1-L9">A range past the end</a>
  `);

  assert.deepEqual(validateLinks(site).failures, [
    'topic/note: missing anchor /#finish',
    'topic/note: missing anchor /source/app/user.rb/#L3',
    'topic/note: missing anchor /source/app/user.rb/#L1-L9',
  ]);
});
