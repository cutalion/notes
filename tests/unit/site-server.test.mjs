import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveSiteRoute, startSiteServer } from '../../scripts/site-server.mjs';

function siteFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-site-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const write = (relative, contents = 'fixture') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };
  const files = {
    note: write('repo/team/docs/topic/note.md'),
    chart: write('repo/team/docs/topic/chart.png'),
    model: write('repo/app/user.rb'),
    home: write('pages/index.html'),
    page: write('pages/topic/note/index.html'),
    script: write('shell/_astro/page.js'),
    favicon: write('shell/favicon.svg'),
    search: write('search/pagefind.js'),
  };
  write('shell/notespathmarker/index.html');
  const site = {
    index: {
      notes: {
        'topic/note.md': {
          attachments: ['team/docs/topic/chart.png'],
          sources: ['app/user.rb', 'app/gone.rb'],
        },
      },
    },
    shellRoot: path.join(root, 'shell'),
    pagesRoot: path.join(root, 'pages'),
    searchDir: path.join(root, 'search'),
    roots: { repoRoot: path.join(root, 'repo'), notesRoot: path.join(root, 'repo', 'team', 'docs') },
  };
  return { files, resolve: (requestUrl) => resolveSiteRoute({ ...site, requestUrl }) };
}

test('resolves note pages with and without a trailing slash', (t) => {
  const { files, resolve } = siteFixture(t);

  assert.deepEqual(resolve('/topic/note/'), { kind: 'page', file: files.page, route: '/topic/note' });
  assert.deepEqual(resolve('/topic/note'), { kind: 'page', file: files.page, route: '/topic/note' });
  assert.deepEqual(resolve('/'), { kind: 'page', file: files.home, route: '/' });
  assert.equal(resolve('/topic/other/'), undefined);
});

test('resolves raw notes, linked attachments, and search files to files on disk', (t) => {
  const { files, resolve } = siteFixture(t);

  assert.deepEqual(resolve('/topic/note.md'), { kind: 'file', file: files.note });
  assert.deepEqual(resolve('/attachments/team/docs/topic/chart.png'), { kind: 'file', file: files.chart });
  assert.deepEqual(resolve('/pagefind/pagefind.js'), { kind: 'file', file: files.search });
});

test('resolves a source page only for a file that a note links', (t) => {
  const { files, resolve } = siteFixture(t);

  assert.deepEqual(resolve('/source/app/user.rb/'), {
    kind: 'source',
    entry: { repoRelative: 'app/user.rb', target: files.model, exists: true },
  });
  assert.equal(resolve('/source/app/gone.rb/').entry.exists, false);
  assert.equal(resolve('/source/app/other.rb/'), undefined);
});

test('resolves shell assets but not the shell marker pages', (t) => {
  const { files, resolve } = siteFixture(t);

  assert.deepEqual(resolve('/_astro/page.js'), { kind: 'file', file: files.script });
  assert.deepEqual(resolve('/favicon.svg'), { kind: 'file', file: files.favicon });
  assert.equal(resolve('/notespathmarker/'), undefined);
});

function occupiedPort(t) {
  return new Promise((resolve) => {
    const blocker = net.createServer().listen(0, '127.0.0.1', () => resolve(blocker.address().port));
    t.after(() => blocker.close());
  });
}

test('moves to the next free port only when the port was not asked for', async (t) => {
  const port = await occupiedPort(t);
  const handler = async () => {};

  const server = await startSiteServer({ handler, port, orNextFree: true });
  t.after(() => server.close());
  assert.ok(server.address().port > port);

  await assert.rejects(startSiteServer({ handler, port, orNextFree: false }), { code: 'EADDRINUSE' });
});
