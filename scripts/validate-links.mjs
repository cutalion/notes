import fs from 'node:fs';
import path from 'node:path';

import { insertSidebar } from './sidebar.mjs';
import { resolveSiteRoute } from './site-server.mjs';

const externalLink = /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i;
// Links are read from tags only: text in a code sample can look like an attribute.
const tag = /<[a-z][^>]*>/gi;
const linkAttribute = /\s(?:href|src)=["']([^"']+)["']/g;

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function pageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(target);
    return entry.name === 'index.html' ? [target] : [];
  }).sort();
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => decodeHtml(match[1])));
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

// A source page has one `L<n>` id per line, and `#L<a>-L<b>` marks a range. A file missing from
// this checkout has a page without lines, and a line anchor into it is not a broken link.
function sourceHasAnchor(entry, fragment) {
  if (!entry.exists) return true;
  const range = fragment.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!range) return false;
  const lastLine = Math.max(Number(range[1]), Number(range[2] ?? 0));
  return Number(range[1]) >= 1 && lastLine <= lineCount(entry.target);
}

// Checks each page as the server sends it, one page at a time. A link is valid when the server
// has something to send for it, and its anchor is valid when the target has that id or line.
export function validateLinks({ index, sidebar, shellRoot, pagesRoot, searchDir, roots }) {
  const targets = new Map();
  const pageIds = new Map();
  const failures = [];
  let checked = 0;

  function targetFor(pathname) {
    if (!targets.has(pathname)) {
      targets.set(pathname, resolveSiteRoute({ requestUrl: pathname, index, shellRoot, pagesRoot, searchDir, roots }));
    }
    return targets.get(pathname);
  }

  function idsOf(file) {
    if (!pageIds.has(file)) pageIds.set(file, idsIn(fs.readFileSync(file, 'utf8')));
    return pageIds.get(file);
  }

  const files = pageFiles(pagesRoot);
  for (const file of files) {
    const page = path.relative(pagesRoot, path.dirname(file)).split(path.sep).join('/') || 'index';
    const route = page === 'index' ? '/' : `/${page}/`;
    const html = insertSidebar(fs.readFileSync(file, 'utf8'), sidebar, route.replace(/(.)\/$/, '$1'));

    const links = html.match(tag).flatMap((element) => [...element.matchAll(linkAttribute)].map((match) => match[1]));
    for (const encodedLink of links) {
      const link = decodeHtml(encodedLink);
      if (externalLink.test(link)) continue;
      checked += 1;

      const url = new URL(link, `http://localhost${route}`);
      const target = targetFor(url.pathname);
      if (!target) {
        failures.push(`${page}: missing target ${link}`);
        continue;
      }
      if (!url.hash) continue;
      const fragment = decodeURIComponent(url.hash.slice(1));
      const found = target.kind === 'source'
        ? sourceHasAnchor(target.entry, fragment)
        : target.kind !== 'page' || idsOf(target.file).has(fragment);
      if (!found) failures.push(`${page}: missing anchor ${link}`);
    }
  }

  return { pages: files.length, checked, failures };
}
