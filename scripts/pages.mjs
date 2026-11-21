import fs from 'node:fs';
import path from 'node:path';

import { buildSidebar, normalizeNote } from './content.mjs';
import { writeFileAtomically } from './files.mjs';
import { notesRoot, options, outRoot } from './paths.mjs';
import { escapeHtml, fillShell } from './shell.mjs';

export const defaultPagesRoot = path.join(outRoot, 'pages');

// A note page on disk keeps the sidebar marker; the server inserts the sidebar when it sends the page.
export function notePageFile(pagesRoot, route) {
  return path.join(pagesRoot, route, 'index.html');
}

export async function writeNotePage({ file, root = notesRoot, renderer, template, pagesRoot = defaultPagesRoot }) {
  const note = normalizeNote(file, root);
  const { html, headings } = await renderer.render(file);
  writeFileAtomically(notePageFile(pagesRoot, note.route), fillShell(template, { ...note, html, headings }));
  return note;
}

// A notes folder without `index.md` gets a home page that lists the notes, so `/` always opens.
export function writeHomePage({ root = notesRoot, template, pagesRoot = defaultPagesRoot }) {
  if (fs.existsSync(path.join(root, 'index.md'))) return;

  const groups = buildSidebar(root);
  const headings = groups.map((group, index) => ({ depth: 2, slug: `group-${index + 1}`, text: group.label }));
  const html = groups.map((group, index) => {
    const links = group.items.map((item) => `<li><a href="${escapeHtml(item.link)}">${escapeHtml(item.label)}</a></li>`);
    return `<h2 id="${headings[index].slug}">${escapeHtml(group.label)}</h2><ul>${links.join('')}</ul>`;
  }).join('');

  const file = notePageFile(pagesRoot, '/');
  writeFileAtomically(file, fillShell(template, { title: options.title, relativePath: '', html, headings, generated: true }));
  return file;
}

// The folder of a page can hold the pages of deeper notes, so only the page itself goes.
export function removeNotePage(pagesRoot, route) {
  const file = notePageFile(pagesRoot, route);
  fs.rmSync(file, { force: true });
  const directory = path.dirname(file);
  if (directory !== pagesRoot && fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}
