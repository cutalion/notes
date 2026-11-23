import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { notePageFile } from './pages.mjs';
import { dependencyRoot, notesRoot, repoRoot } from './paths.mjs';
import { fillSourcePage } from './render-source.mjs';
import { currentSearchDir } from './search-index.mjs';
import { insertSidebar, sidebarFile } from './sidebar.mjs';
import { resolveSiteFile, siteIndexFile } from './site-index.mjs';
import { resolveStaticFile, sendFile } from './static-server.mjs';

const sourceShellPage = path.join('source', 'sourcepathmarker', 'index.html');
const defaultRoots = { notesRoot, repoRoot };
// The browser loads Mermaid and its ELK layout as their packages ship them: prebuilt modules that
// find each other by relative paths. Bundling them into the shell took most of the time and of
// the memory of its build.
const diagramModules = [
  ['/_mermaid/', path.join(dependencyRoot('mermaid'), 'dist')],
  ['/_mermaid-layout-elk/', path.join(dependencyRoot('@mermaid-js/layout-elk'), 'dist')],
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function sendHtml(request, response, html, status = 200) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : html);
}

function decodedPathname(requestUrl) {
  try {
    return decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return undefined;
  }
}

// Only the Astro assets and top-level files of the shell are public; its marker pages are not.
function shellAsset(shellRoot, pathname, requestUrl) {
  const topLevelFile = !pathname.slice(1).includes('/') && path.extname(pathname) !== '';
  if (!pathname.startsWith('/_astro/') && !topLevelFile) return;
  return resolveStaticFile(shellRoot, requestUrl);
}

function linkedSource(index, pathname, repoRoot) {
  const repoRelative = pathname.slice('/source/'.length).replace(/\/$/, '');
  const linked = Object.values(index.notes).some((note) => note.sources.includes(repoRelative));
  if (!linked) return;
  const target = path.join(repoRoot, repoRelative);
  return { repoRelative, target, exists: isFile(target) };
}

// Only the modules are public: the packages keep tests and source maps in the same folders.
function diagramModule(pathname) {
  if (!pathname.endsWith('.mjs')) return;
  for (const [prefix, root] of diagramModules) {
    if (pathname.startsWith(prefix)) return resolveStaticFile(root, pathname.slice(prefix.length - 1));
  }
}

// Says what a URL serves: a file to send, a note page, or a source page to render. The server
// and the link check of the build both ask here, so a link is valid exactly when it is served.
export function resolveSiteRoute({ requestUrl, index, shellRoot, pagesRoot, searchDir, roots = defaultRoots }) {
  const pathname = decodedPathname(requestUrl);
  if (pathname === undefined) return;
  const route = pathname.length > 1 ? pathname.replace(/\/$/, '') : '/';

  if (pathname.startsWith('/pagefind/')) {
    const file = searchDir && resolveStaticFile(searchDir, pathname.slice('/pagefind'.length));
    if (file) return { kind: 'file', file };
  }

  const diagramFile = diagramModule(pathname);
  if (diagramFile) return { kind: 'file', file: diagramFile };

  const siteFile = resolveSiteFile(index, requestUrl, roots);
  if (siteFile) return { kind: 'file', file: siteFile };

  if (pathname.startsWith('/source/')) {
    const entry = linkedSource(index, pathname, roots.repoRoot);
    if (entry) return { kind: 'source', entry };
  } else {
    const pageFile = notePageFile(pagesRoot, route);
    if (isFile(pageFile)) return { kind: 'page', file: pageFile, route };
  }

  const asset = shellAsset(shellRoot, pathname, requestUrl);
  if (asset) return { kind: 'file', file: asset };
}

// Every request reads what it needs from disk; the process keeps no pages, sidebar, or index in memory.
export function createSiteHandler({ shellRoot, pagesRoot, sourceRenderer }) {
  return async function handle(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end('Method not allowed');
    }
    const requestUrl = request.url || '/';
    const pathname = decodedPathname(requestUrl);
    if (pathname === undefined) return sendHtml(request, response, 'Bad request', 400);

    const sidebar = readJson(sidebarFile);
    const index = readJson(siteIndexFile);
    const target = resolveSiteRoute({ requestUrl, index, shellRoot, pagesRoot, searchDir: currentSearchDir() });

    if (target?.kind === 'file') return sendFile(request, response, target.file);
    if (target?.kind === 'page') {
      return sendHtml(request, response, insertSidebar(fs.readFileSync(target.file, 'utf8'), sidebar, target.route));
    }
    if (target?.kind === 'source') {
      const template = fs.readFileSync(path.join(shellRoot, sourceShellPage), 'utf8');
      const page = fillSourcePage(template, target.entry, await sourceRenderer.render(target.entry));
      return sendHtml(request, response, insertSidebar(page, sidebar, pathname));
    }

    const route = pathname.length > 1 ? pathname.replace(/\/$/, '') : '/';
    const notFound = fs.readFileSync(path.join(shellRoot, '404.html'), 'utf8');
    return sendHtml(request, response, insertSidebar(notFound, sidebar, route), 404);
  };
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

// With `orNextFree`, a busy port moves the site to the next one, so a second repository can
// serve its notes next to the first. A port that the user asked for is never replaced.
export async function startSiteServer({ handler, host = '127.0.0.1', port = 4321, orNextFree = false }) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal error');
    });
  });
  const lastPort = orNextFree ? Number(port) + 20 : Number(port);
  for (let candidate = Number(port); ; candidate += 1) {
    try {
      return await listen(server, host, candidate);
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate === lastPort) throw error;
    }
  }
}
