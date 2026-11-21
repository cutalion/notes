import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSiteIndex, removeNote, resolveSiteFile, updateNote } from '../../scripts/site-index.mjs';

function repoFixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-repo-'));
  t.after(() => fs.rmSync(repoRoot, { force: true, recursive: true }));
  const notesRoot = path.join(repoRoot, 'team', 'docs');
  const write = (relative, contents) => {
    const file = path.join(repoRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };
  write('team/docs/topic/note.md', '---\ntitle: Note\n---\n\n![Chart](chart.png) and [model](../../../app/user.rb).\n');
  write('team/docs/topic/chart.png', 'png');
  write('team/docs/topic/unlinked.png', 'png');
  write('app/user.rb', 'class User; end');
  return { roots: { notesRoot, repoRoot }, write };
}

test('serves linked attachments and raw notes from disk, and nothing else', (t) => {
  const { roots } = repoFixture(t);
  const index = buildSiteIndex(roots);

  assert.deepEqual(index.notes['topic/note.md'], {
    attachments: ['team/docs/topic/chart.png'],
    sources: ['app/user.rb'],
  });
  assert.equal(resolveSiteFile(index, '/attachments/team/docs/topic/chart.png', roots), path.join(roots.notesRoot, 'topic', 'chart.png'));
  assert.equal(resolveSiteFile(index, '/topic/note.md', roots), path.join(roots.notesRoot, 'topic', 'note.md'));
  assert.equal(resolveSiteFile(index, '/attachments/team/docs/topic/unlinked.png', roots), undefined);
  assert.equal(resolveSiteFile(index, '/attachments/app/user.rb', roots), undefined);
  assert.equal(resolveSiteFile(index, '/topic/other.md', roots), undefined);
  assert.equal(resolveSiteFile(index, '/topic/note/', roots), undefined);
});

test('updates one note without rescanning the others', (t) => {
  const { roots, write } = repoFixture(t);
  const index = buildSiteIndex(roots);

  const added = write('team/docs/topic/new.md', '---\ntitle: New\n---\n\n![Other](unlinked.png)\n');
  updateNote(index, added, roots);
  assert.equal(resolveSiteFile(index, '/attachments/team/docs/topic/unlinked.png', roots), path.join(roots.notesRoot, 'topic', 'unlinked.png'));
  assert.equal(resolveSiteFile(index, '/topic/new.md', roots), added);

  removeNote(index, 'topic/new.md');
  assert.equal(resolveSiteFile(index, '/attachments/team/docs/topic/unlinked.png', roots), undefined);
  assert.equal(resolveSiteFile(index, '/topic/new.md', roots), undefined);
});

test('does not serve a linked attachment that is missing on disk', (t) => {
  const { roots } = repoFixture(t);
  const index = buildSiteIndex(roots);

  fs.rmSync(path.join(roots.notesRoot, 'topic', 'chart.png'));

  assert.equal(resolveSiteFile(index, '/attachments/team/docs/topic/chart.png', roots), undefined);
});
