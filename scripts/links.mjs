import fs from 'node:fs';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';

import { routeFromRelative } from './content.mjs';
import { notesRoot, repoRoot } from './paths.mjs';

export const binaryExtensions = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.pdf', '.png', '.svg', '.webp', '.xls', '.xlsx', '.zip',
]);

const ignoredProtocol = /^(?:https?:|mailto:|tel:|data:|javascript:)/i;

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function splitReference(rawUrl) {
  const hashAt = rawUrl.indexOf('#');
  const queryAt = rawUrl.indexOf('?');
  const cut = [hashAt, queryAt].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? rawUrl.length;
  const pathPart = rawUrl.slice(0, cut);
  const suffix = rawUrl.slice(cut);
  const lineMatch = pathPart.match(/^(.*):(\d+)$/);
  if (!lineMatch) return { pathPart, suffix };
  return { pathPart: lineMatch[1], suffix: `#L${lineMatch[2]}${suffix.replace(/^#/, '&')}` };
}

export function resolveLocalLink({ noteFile, url, roots = { notesRoot, repoRoot } }) {
  if (!url || url.startsWith('#') || ignoredProtocol.test(url)) return { kind: 'external', href: url };

  const { pathPart: encodedPath, suffix } = splitReference(url);
  let pathPart;
  try {
    pathPart = decodeURIComponent(encodedPath.replace(/^<|>$/g, ''));
  } catch {
    throw new Error(`${noteFile}: link has invalid URL encoding: ${url}`);
  }

  if (pathPart.startsWith('/') && !pathPart.startsWith(roots.repoRoot)) {
    if (pathPart.startsWith('/source/') || pathPart.startsWith('/attachments/')) {
      return { kind: 'site', href: url };
    }
    throw new Error(`${noteFile}: absolute path is outside the repository: ${pathPart}`);
  }

  const target = path.resolve(pathPart.startsWith('/') ? pathPart : path.join(path.dirname(noteFile), pathPart));
  if (!inside(roots.repoRoot, target)) {
    throw new Error(`${noteFile}: path traversal leaves the repository: ${url}`);
  }

  const repoRelative = path.relative(roots.repoRoot, target).split(path.sep).join('/');
  const notesRelative = path.relative(roots.notesRoot, target).split(path.sep).join('/');
  const extension = path.extname(target).toLowerCase();

  if (inside(roots.notesRoot, target) && extension === '.md' && !path.basename(target).startsWith('_')) {
    return {
      kind: 'note',
      target,
      href: `${routeFromRelative(notesRelative)}${suffix}`,
      repoRelative,
    };
  }

  if (binaryExtensions.has(extension)) {
    return {
      kind: 'attachment',
      target,
      exists: fs.existsSync(target) && fs.statSync(target).isFile(),
      href: `/attachments/${encodePath(repoRelative)}${suffix}`,
      repoRelative,
    };
  }

  return {
    kind: 'source',
    target,
    exists: fs.existsSync(target) && fs.statSync(target).isFile(),
    href: `/source/${encodePath(repoRelative)}/${suffix}`,
    repoRelative,
  };
}

export function linksInMarkdown(note) {
  const tree = fromMarkdown(note.body);
  const links = [];
  visit(tree, ['link', 'image'], (node) => {
    links.push({ url: node.url, image: node.type === 'image' });
  });
  return links;
}

export function remarkLocalLinks() {
  return (tree, file) => {
    const noteFile = path.resolve(String(file.path));
    visit(tree, ['link', 'image'], (node) => {
      const resolved = resolveLocalLink({ noteFile, url: node.url });
      if (!['external', 'site'].includes(resolved.kind)) node.url = resolved.href;
    });
  };
}
