import fs from 'node:fs';
import path from 'node:path';

import chokidar from 'chokidar';

import { isHiddenName, listNoteFiles, routeFromRelative } from './content.mjs';
import { defaultPagesRoot, removeNotePage, writeNotePage } from './pages.mjs';
import { notesRoot, options, outRoot } from './paths.mjs';
import { createNoteRenderer } from './render-note.mjs';
import { createSourceRenderer } from './render-source.mjs';
import { buildSearchIndex } from './search-index.mjs';
import { ensureShell } from './shell.mjs';
import { writeSidebar } from './sidebar.mjs';
import { createSiteHandler, startSiteServer } from './site-server.mjs';
import { removeNote, updateNote, writeSiteIndex } from './site-index.mjs';

const host = '127.0.0.1';
const pagesRoot = defaultPagesRoot;

function relativeNotePath(file) {
  return path.relative(notesRoot, file).split(path.sep).join('/');
}

function isIgnored(file, stats) {
  const relative = path.relative(notesRoot, file);
  const segments = relative.split(path.sep);
  if (segments.some(isHiddenName)) return true;
  return Boolean(stats?.isFile()) && !file.endsWith('.md');
}

const started = Date.now();
const { root: shellRoot, template } = await ensureShell();
const noteRenderer = await createNoteRenderer();
const sourceRenderer = await createSourceRenderer();
const index = { notes: {} };

// A note with broken frontmatter is reported and left out until it is fixed; the rest keep working.
async function refreshNote(file) {
  try {
    updateNote(index, file);
    await writeNotePage({ file, renderer: noteRenderer, template, pagesRoot });
  } catch (error) {
    console.error(`[notes] ${relativeNotePath(file)}: ${error.message}`);
  }
}

function dropNote(relativePath) {
  removeNote(index, relativePath);
  removeNotePage(pagesRoot, routeFromRelative(relativePath));
}

async function publishSiteData() {
  writeSiteIndex(index);
  try {
    writeSidebar(template);
  } catch (error) {
    console.error(`[notes] The sidebar keeps its previous state: ${error.message}`);
  }
  await buildSearchIndex({ pagesRoot });
}

fs.rmSync(pagesRoot, { recursive: true, force: true });
for (const file of listNoteFiles()) await refreshNote(file);
await publishSiteData();

const handler = createSiteHandler({ shellRoot, pagesRoot, sourceRenderer });
const server = await startSiteServer({ handler, host, port: options.port, orNextFree: options.portIsDefault });
console.log(`[notes] Ready in ${((Date.now() - started) / 1000).toFixed(1)}s: http://${host}:${server.address().port}/`);

const changedNotes = new Set();
const removedPaths = new Set();
let flushTimer;
let flushing;

async function flush() {
  flushTimer = undefined;
  const changed = [...changedNotes];
  const removed = [...removedPaths];
  changedNotes.clear();
  removedPaths.clear();
  const updateStarted = Date.now();

  for (const relativePath of removed) {
    const prefix = `${relativePath}/`;
    for (const indexed of Object.keys(index.notes)) {
      if (indexed === relativePath || indexed.startsWith(prefix)) dropNote(indexed);
    }
  }
  for (const file of changed) await refreshNote(file);
  await publishSiteData();
  console.log(`[notes] Updated ${changed.length + removed.length} path(s) in ${Date.now() - updateStarted}ms.`);
}

// Changes made while an update runs wait for it, then go out together.
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    await flushing;
    flushing = flush().catch((error) => console.error(error));
  }, 100);
}

const watcher = chokidar.watch(notesRoot, { ignoreInitial: true, ignored: isIgnored });
watcher
  .on('add', (file) => { changedNotes.add(file); scheduleFlush(); })
  .on('change', (file) => { changedNotes.add(file); scheduleFlush(); })
  .on('unlink', (file) => { changedNotes.delete(file); removedPaths.add(relativeNotePath(file)); scheduleFlush(); })
  .on('unlinkDir', (directory) => { removedPaths.add(relativeNotePath(directory)); scheduleFlush(); })
  .on('ready', () => console.log(`[notes] Watching ${notesRoot}; shell in ${path.relative(outRoot, shellRoot)}.`));

function stop() {
  watcher.close();
  server.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
