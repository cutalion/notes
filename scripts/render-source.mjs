import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { hashFiles, writeFileAtomically } from './files.mjs';
import { createCodeHighlighter } from './highlight.mjs';
import { fillShell } from './shell.mjs';
import { languageFor, sourceLineAnchors, sourceViewHtml } from './source-view.mjs';
import { outRoot } from './paths.mjs';

const rendererFiles = [
  'scripts/files.mjs',
  'scripts/highlight.mjs',
  'scripts/render-source.mjs',
  'scripts/source-view.mjs',
  'package.json',
];

// `entry` is the source record that `resolveSiteRoute()` in `scripts/site-server.mjs` returns.
export async function createSourceRenderer({ cacheRoot = path.join(outRoot, 'sources') } = {}) {
  const hash = hashFiles(rendererFiles);
  const highlight = await createCodeHighlighter();

  async function render(entry) {
    const body = entry.exists ? fs.readFileSync(entry.target, 'utf8') : undefined;
    const key = crypto.createHash('sha256').update(`${hash}\0${entry.repoRelative}\0${body ?? '\0missing'}`).digest('hex');
    const cacheFile = path.join(cacheRoot, `${entry.repoRelative}.json`);
    const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : undefined;
    if (cached?.key === key) return cached.html;

    const highlighted = body === undefined
      ? undefined
      : await highlight(body, languageFor(entry.repoRelative), [sourceLineAnchors]);
    const html = sourceViewHtml(entry.repoRelative, highlighted);
    writeFileAtomically(cacheFile, JSON.stringify({ key, html }));
    return html;
  }

  return { render };
}

export function fillSourcePage(sourceTemplate, entry, html) {
  return fillShell(sourceTemplate, {
    title: path.basename(entry.repoRelative),
    description: `Repository source: ${entry.repoRelative}`,
    relativePath: entry.repoRelative,
    html,
    headings: [],
  });
}
