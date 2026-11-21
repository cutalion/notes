import fs from 'node:fs';
import path from 'node:path';

import { normalizeNote } from './content.mjs';
import { writeFileAtomically } from './files.mjs';
import { notesRoot, outRoot } from './paths.mjs';
import { fillShell } from './shell.mjs';

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

export function removeNotePage(pagesRoot, route) {
  fs.rmSync(path.dirname(notePageFile(pagesRoot, route)), { recursive: true, force: true });
}
