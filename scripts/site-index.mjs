import fs from 'node:fs';
import path from 'node:path';

import { listNoteFiles, normalizeNote } from './content.mjs';
import { writeFileAtomically } from './files.mjs';
import { linksInMarkdown, resolveLocalLink } from './links.mjs';
import { notesRoot, outRoot, repoRoot } from './paths.mjs';

export const siteIndexFile = path.join(outRoot, 'site-index.json');

const defaultRoots = { notesRoot, repoRoot };

function linkedFiles(file, roots) {
  const note = normalizeNote(file, roots.notesRoot);
  const attachments = new Set();
  const sources = new Set();
  for (const link of linksInMarkdown(note)) {
    const resolved = resolveLocalLink({ noteFile: file, url: link.url, roots });
    if (resolved.kind === 'attachment') attachments.add(resolved.repoRelative);
    if (resolved.kind === 'source') sources.add(resolved.repoRelative);
  }
  return { relativePath: note.relativePath, attachments: [...attachments], sources: [...sources] };
}

// Each note lists the repository files it links, so one changed note never rescans the others.
export function buildSiteIndex(roots = defaultRoots) {
  const index = { notes: {} };
  for (const file of listNoteFiles(roots.notesRoot)) updateNote(index, file, roots);
  return index;
}

export function updateNote(index, file, roots = defaultRoots) {
  const { relativePath, attachments, sources } = linkedFiles(file, roots);
  index.notes[relativePath] = { attachments, sources };
}

export function removeNote(index, relativePath) {
  delete index.notes[relativePath];
}

export function writeSiteIndex(index) {
  writeFileAtomically(siteIndexFile, JSON.stringify(index));
}

function isFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

// Attachments and raw notes come straight from the notes directory, never from a copy.
export function resolveSiteFile(index, requestPath, roots = defaultRoots) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestPath, 'http://localhost').pathname);
  } catch {
    return;
  }

  if (pathname.startsWith('/attachments/')) {
    const repoRelative = pathname.slice('/attachments/'.length);
    const linked = Object.values(index.notes).some((note) => note.attachments.includes(repoRelative));
    const file = path.join(roots.repoRoot, repoRelative);
    return linked && isFile(file) ? file : undefined;
  }

  const relativePath = pathname.slice(1);
  if (!index.notes[relativePath]) return;
  const file = path.join(roots.notesRoot, relativePath);
  return isFile(file) ? file : undefined;
}
