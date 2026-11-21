import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSidebar, listNoteFiles, loadNotes, normalizeNote, parseFrontmatter } from '../../scripts/content.mjs';

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-content-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

function write(root, relative, source) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
}

function note(frontmatter, body = 'Body text.') {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

test('frontmatter is strict and title is required', () => {
  assert.throws(() => parseFrontmatter('No frontmatter'), /must start with YAML frontmatter/);
  assert.throws(() => parseFrontmatter(note('description: Missing title')), /title must be a non-empty string/);
  assert.throws(() => parseFrontmatter(note('title: Valid\norder: last')), /order must be a number/);
  assert.equal(parseFrontmatter(note('title: Valid')).data.title, 'Valid');
});

test('private files and private directories are excluded', (t) => {
  const root = fixtureRoot(t);
  write(root, 'public.md', note('title: Public'));
  write(root, '_private.md', 'frontmatter is intentionally unnecessary');
  write(root, '_drafts/hidden.md', note('title: Hidden'));
  write(root, '.notes/pages/ignored.md', note('title: Build output'));
  write(root, 'node_modules/package/readme.md', note('title: Dependency'));

  assert.deepEqual(listNoteFiles(root).map((file) => path.basename(file)), ['public.md']);
});

test('group, order, and routes use documented defaults', (t) => {
  const root = fixtureRoot(t);
  const nested = write(root, 'topic/example.md', note('title: Example'));
  const topLevel = write(root, 'plain.md', note('title: Plain'));
  const index = write(root, 'index.md', note('title: Home'));
  const nestedIndex = write(root, 'problems/index.md', note('title: Problems'));

  const nestedNote = normalizeNote(nested, root);
  assert.equal(nestedNote.group, 'topic');
  assert.equal(nestedNote.order, 999);
  assert.equal(nestedNote.route, '/topic/example');

  const topLevelNote = normalizeNote(topLevel, root);
  assert.equal(topLevelNote.group, 'Notes');
  assert.equal(topLevelNote.order, 999);
  assert.equal(topLevelNote.route, '/plain');
  assert.equal(normalizeNote(index, root).route, '/');
  assert.equal(normalizeNote(nestedIndex, root).route, '/problems');
  const problems = buildSidebar(root).find((entry) => entry.label === 'problems');
  assert.equal(problems.items[0].link, '/problems');
});

test('navigation defaults to recently updated topics and notes', (t) => {
  const root = fixtureRoot(t);
  write(root, 'index.md', note('title: Home'));
  const oldest = write(root, 'topic/c.md', note('title: Oldest\ngroup: Topic\norder: 1'));
  const middle = write(root, 'topic/a.md', note('title: Middle\ngroup: Topic\norder: 3'));
  const newest = write(root, 'topic/b.md', note('title: Newest\ngroup: Topic\norder: 2'));
  const archive = write(root, 'archive/a.md', note('title: Archive\ngroup: Archive'));
  fs.utimesSync(oldest, new Date(1_000), new Date(1_000));
  fs.utimesSync(middle, new Date(2_000), new Date(2_000));
  fs.utimesSync(archive, new Date(3_000), new Date(3_000));
  fs.utimesSync(newest, new Date(4_000), new Date(4_000));

  const sidebar = buildSidebar(root);
  const topic = sidebar.find((entry) => entry.label === 'Topic');
  assert.deepEqual(sidebar.map((entry) => entry.label), ['Overview', 'Topic', 'Archive']);
  assert.deepEqual(topic.items.map((entry) => entry.link), ['/topic/b', '/topic/a', '/topic/c']);
  assert.equal(topic.items[0].attrs['data-note-path'], 'topic/b.md');
  assert.equal(topic.items[0].attrs['data-note-updated'], 4_000);
});

test('adding a fixture note updates navigation without application changes', (t) => {
  const root = fixtureRoot(t);
  write(root, 'index.md', note('title: Home'));
  assert.equal(loadNotes(root).length, 1);

  write(
    root,
    'new-topic/search-fixture.md',
    note('title: Dynamic fixture\ndescription: Search fixture', 'Pagefind fixture body.'),
  );
  const notes = loadNotes(root);
  const sidebar = buildSidebar(root);

  assert.equal(notes.length, 2);
  assert.match(notes[1].body, /Pagefind fixture body/);
  assert.ok(sidebar.some((group) => group.label === 'new-topic'));
  assert.ok(JSON.stringify(sidebar).includes('Dynamic fixture'));
});
