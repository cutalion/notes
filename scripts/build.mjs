import fs from 'node:fs';
import path from 'node:path';

import { listNoteFiles } from './content.mjs';
import { defaultPagesRoot, notePageFile, writeNotePage } from './pages.mjs';
import { notesRoot } from './paths.mjs';
import { createNoteRenderer } from './render-note.mjs';
import { buildSearchIndex, currentSearchDir } from './search-index.mjs';
import { ensureShell } from './shell.mjs';
import { sidebarFile, writeSidebar } from './sidebar.mjs';
import { siteIndexFile, updateNote, writeSiteIndex } from './site-index.mjs';
import { validateLinks } from './validate-links.mjs';

const pagesRoot = defaultPagesRoot;

function fail(summary, lines) {
  console.error(`[notes] ${summary}\n${lines.join('\n')}`);
  process.exit(1);
}

// A page whose note is gone would keep links to it valid, so it must not survive a build.
function removeStalePages(directory, current) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) removeStalePages(target, current);
    else if (!current.has(target)) fs.rmSync(target);
  }
  if (directory !== pagesRoot && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}

const started = Date.now();
const { root: shellRoot, template } = await ensureShell();
const renderer = await createNoteRenderer();
const index = { notes: {} };
const pages = new Set();
const broken = [];

// A running dev server reads the same pages, so each one is replaced in place, never removed first.
for (const file of listNoteFiles()) {
  try {
    updateNote(index, file);
    const note = await writeNotePage({ file, renderer, template, pagesRoot });
    pages.add(notePageFile(pagesRoot, note.route));
  } catch (error) {
    broken.push(`${path.relative(notesRoot, file)}: ${error.message}`);
  }
}
if (broken.length > 0) fail('Notes that do not render:', broken);

removeStalePages(pagesRoot, pages);
writeSiteIndex(index);
writeSidebar(template);
await buildSearchIndex({ pagesRoot });

const { pages: pageCount, checked, failures } = validateLinks({
  index: JSON.parse(fs.readFileSync(siteIndexFile, 'utf8')),
  sidebar: JSON.parse(fs.readFileSync(sidebarFile, 'utf8')),
  shellRoot,
  pagesRoot,
  searchDir: currentSearchDir(),
});
if (failures.length > 0) fail('Broken local links:', failures);

console.log(`[notes] Built ${pageCount} pages and validated ${checked} local links in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
