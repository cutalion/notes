import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveLocalLink } from '../../scripts/links.mjs';

function repository(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-links-'));
  const notesRoot = path.join(repoRoot, 'team', 'docs');
  const noteFile = path.join(notesRoot, 'topic', 'note.md');
  fs.mkdirSync(path.dirname(noteFile), { recursive: true });
  fs.writeFileSync(noteFile, 'fixture');
  t.after(() => fs.rmSync(repoRoot, { force: true, recursive: true }));
  return { repoRoot, notesRoot, noteFile };
}

test('note links resolve to clean routes and preserve anchors', (t) => {
  const roots = repository(t);
  const target = path.join(roots.notesRoot, 'other.md');
  fs.writeFileSync(target, 'fixture');

  const resolved = resolveLocalLink({ noteFile: roots.noteFile, url: '../other.md#section', roots });
  assert.equal(resolved.kind, 'note');
  assert.equal(resolved.href, '/other#section');
  assert.equal(resolved.target, target);

  const index = resolveLocalLink({ noteFile: roots.noteFile, url: '../problems/index.md#section', roots });
  assert.equal(index.kind, 'note');
  assert.equal(index.href, '/problems#section');
});

test('source files preserve line references and missing checkout paths', (t) => {
  const roots = repository(t);
  const source = path.join(roots.repoRoot, 'app', 'model.rb');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, 'class Model\nend\n');

  const existing = resolveLocalLink({ noteFile: roots.noteFile, url: '../../../app/model.rb#L2', roots });
  const colonLine = resolveLocalLink({ noteFile: roots.noteFile, url: `${source}:1`, roots });
  const missing = resolveLocalLink({ noteFile: roots.noteFile, url: '../../../old/branch_only.rb', roots });

  assert.equal(existing.kind, 'source');
  assert.equal(existing.exists, true);
  assert.equal(existing.href, '/source/app/model.rb/#L2');
  assert.equal(colonLine.href, '/source/app/model.rb/#L1');
  assert.equal(missing.kind, 'source');
  assert.equal(missing.exists, false);
  assert.equal(missing.href, '/source/old/branch_only.rb/');
});

test('binary attachments get explicit output paths', (t) => {
  const roots = repository(t);
  const image = path.join(path.dirname(roots.noteFile), 'mockup.png');
  fs.writeFileSync(image, 'png fixture');

  const attachment = resolveLocalLink({ noteFile: roots.noteFile, url: 'mockup.png', roots });
  assert.equal(attachment.kind, 'attachment');
  assert.equal(attachment.exists, true);
  assert.equal(attachment.href, '/attachments/team/docs/topic/mockup.png');
});

test('path traversal and absolute paths outside the repository are rejected', (t) => {
  const roots = repository(t);
  assert.throws(
    () => resolveLocalLink({ noteFile: roots.noteFile, url: '../../../../outside.txt', roots }),
    /path traversal leaves the repository/,
  );
  assert.throws(
    () => resolveLocalLink({ noteFile: roots.noteFile, url: '/etc/passwd', roots }),
    /absolute path is outside the repository/,
  );
});
