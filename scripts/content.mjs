import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

import { notesRoot } from './paths.mjs';

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// A `_` prefix hides a file or folder from the site. Dot folders and dependencies are never notes.
export function isHiddenName(name) {
  return name.startsWith('_') || name.startsWith('.') || name === 'node_modules';
}

export function listNoteFiles(root = notesRoot) {
  const files = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (isHiddenName(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
    }
  }

  walk(root);
  return files.sort();
}

const LEADING_HEADING = /^(?:[ \t]*\r?\n)*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/;

// Frontmatter is optional. Without a title there, the title is the heading that opens the note,
// which then leaves the body so the page does not show it twice, or else the file name.
export function parseFrontmatter(source, file = '<note>') {
  const match = source.match(FRONTMATTER);
  const data = match ? parseYaml(match[1], file) : {};
  const body = match ? source.slice(match[0].length) : source;
  if (data.title !== undefined) return { data, body };

  const heading = body.match(LEADING_HEADING);
  const headingTitle = heading ? plainText(heading[1]) : '';
  if (headingTitle) return { data: { ...data, title: headingTitle }, body: body.slice(heading[0].length) };

  return { data: { ...data, title: titleFromFile(file) }, body };
}

function parseYaml(text, file) {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`${file}: invalid YAML frontmatter: ${document.errors[0].message}`);
  }

  const data = document.toJS() ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: frontmatter must be a mapping`);
  }
  if (data.title !== undefined && (typeof data.title !== 'string' || data.title.trim() === '')) {
    throw new Error(`${file}: frontmatter title must be a non-empty string`);
  }
  if (data.description !== undefined && typeof data.description !== 'string') {
    throw new Error(`${file}: frontmatter description must be a string`);
  }
  if (data.group !== undefined && (typeof data.group !== 'string' || data.group.trim() === '')) {
    throw new Error(`${file}: frontmatter group must be a non-empty string`);
  }
  if (data.order !== undefined && (typeof data.order !== 'number' || !Number.isFinite(data.order))) {
    throw new Error(`${file}: frontmatter order must be a number`);
  }

  return data;
}

function plainText(markdown) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}

function titleFromFile(file) {
  const parts = file.replace(/\.md$/i, '').split('/');
  const name = parts.pop();
  return name === 'index' && parts.length > 0 ? parts.pop() : name;
}

export function routeFromRelative(relativePath) {
  const withoutExtension = relativePath.replace(/\.md$/i, '').split(path.sep).join('/');
  if (withoutExtension === 'index') return '/';
  return `/${withoutExtension.replace(/\/index$/, '')}`;
}

export function normalizeNote(file, root = notesRoot) {
  const relativePath = path.relative(root, file).split(path.sep).join('/');
  const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'), relativePath);
  const directory = path.posix.dirname(relativePath);

  return {
    file,
    relativePath,
    route: routeFromRelative(relativePath),
    title: data.title,
    description: data.description,
    group: data.group ?? (directory === '.' ? 'Notes' : path.posix.basename(directory)),
    order: data.order ?? 999,
    updatedAt: fs.statSync(file).mtimeMs,
    body,
  };
}

export function loadNotes(root = notesRoot) {
  return listNoteFiles(root).map((file) => normalizeNote(file, root));
}

function compareText(left, right) {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

export function buildSidebar(root = notesRoot) {
  const notes = loadNotes(root);
  const home = notes.find((note) => note.relativePath === 'index.md');
  const groups = new Map();

  for (const note of notes) {
    if (note === home) continue;
    const entries = groups.get(note.group) ?? [];
    entries.push(note);
    groups.set(note.group, entries);
  }

  const sidebar = home
    ? [{
        label: 'Overview',
        link: '/',
        attrs: noteAttributes(home),
      }]
    : [];

  const recentGroups = [...groups]
    .map(([group, entries]) => ({
      group,
      entries,
      updatedAt: Math.max(...entries.map((entry) => entry.updatedAt)),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || compareText(a.group, b.group));

  for (const { group, entries } of recentGroups) {
    entries.sort((a, b) => b.updatedAt - a.updatedAt || compareText(a.title, b.title) || compareText(a.relativePath, b.relativePath));
    sidebar.push({
      label: group,
      collapsed: true,
      items: entries.map((note) => ({
        label: note.title,
        link: note.route,
        attrs: noteAttributes(note),
      })),
    });
  }

  return sidebar;
}

function noteAttributes(note) {
  return {
    'data-note-title': note.title,
    'data-note-group': note.group,
    'data-note-path': note.relativePath,
    'data-note-updated': Math.trunc(note.updatedAt),
  };
}
