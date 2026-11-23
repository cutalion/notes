import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { contentType, resolveStaticFile } from '../../scripts/static-server.mjs';

test('the local static server resolves clean routes and rejects traversal', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-static-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  fs.mkdirSync(path.join(root, 'topic', 'note'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), 'home');
  fs.writeFileSync(path.join(root, 'topic', 'note', 'index.html'), 'note');
  fs.writeFileSync(path.join(root, 'topic', 'note.md'), '# Raw note');
  fs.writeFileSync(path.join(root, 'asset.js'), 'asset');

  assert.equal(resolveStaticFile(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveStaticFile(root, '/topic/note/'), path.join(root, 'topic', 'note', 'index.html'));
  assert.equal(resolveStaticFile(root, '/topic/note'), path.join(root, 'topic', 'note', 'index.html'));
  assert.equal(resolveStaticFile(root, '/topic/note.md'), path.join(root, 'topic', 'note.md'));
  assert.equal(resolveStaticFile(root, '/asset.js'), path.join(root, 'asset.js'));
  assert.equal(resolveStaticFile(root, '/../outside'), undefined);
  assert.equal(resolveStaticFile(root, '/%2e%2e/outside'), undefined);
  assert.equal(contentType(path.join(root, 'topic', 'note.md')), 'text/plain; charset=utf-8');
  // A browser runs a module only when it comes as a script.
  assert.equal(contentType(path.join(root, 'chunk.mjs')), 'text/javascript; charset=utf-8');
});
