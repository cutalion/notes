import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { build } from 'esbuild';
import remarkBreaks from 'remark-breaks';
import { visit } from 'unist-util-visit';

import { parseFrontmatter } from './content.mjs';
import { hashFiles, writeFileAtomically } from './files.mjs';
import { createCodeHighlighter } from './highlight.mjs';
import { remarkIconLists } from './icon-lists.mjs';
import { remarkLocalLinks } from './links.mjs';
import { configFile, dependencyRoot, notesRoot, options, outRoot, packageRoot, siteRoot } from './paths.mjs';

const rendererFiles = [
  'scripts/content.mjs',
  'scripts/files.mjs',
  'scripts/highlight.mjs',
  'scripts/icon-lists.mjs',
  'scripts/links.mjs',
  'scripts/options.mjs',
  'scripts/paths.mjs',
  'scripts/render-note.mjs',
  'package.json',
];
const starlightRoot = dependencyRoot('@astrojs/starlight');
const starlightTranslations = JSON.parse(fs.readFileSync(path.join(starlightRoot, 'translations', 'en.json'), 'utf8'));
const copyIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect width="13" height="13" x="8" y="8" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function translate(key, values = {}) {
  return (starlightTranslations[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '');
}

// Starlight ships its Markdown plugins as TypeScript, so they are compiled once per renderer hash.
async function loadStarlightPlugins(cacheRoot, hash) {
  const outfile = path.join(cacheRoot, `starlight-markdown-${hash.slice(0, 16)}.mjs`);
  if (!fs.existsSync(outfile)) {
    const { outputFiles } = await build({
      entryPoints: [path.join(starlightRoot, 'integrations', 'remark-rehype.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      write: false,
      outfile,
      logLevel: 'error',
    });
    writeFileAtomically(outfile, outputFiles[0].contents);
  }
  return import(pathToFileURL(outfile).href);
}

// The header of a diagram block shows the title of the diagram. Mermaid draws a `title` from the
// front matter inside the picture too, so that line leaves the source and the title is not shown
// twice. An `accTitle` is not drawn, so it stays where it is.
export function mermaidTitle(source) {
  const unquoted = (value) => value.trim().replace(/^(["'])(.*)\1$/, '$2');
  const frontMatter = source.match(/^\s*---\n([\s\S]*?)\n---[ \t]*\n?/);
  const titleLine = frontMatter?.[1].match(/^title:[ \t]*(.+)$/m);
  if (titleLine) {
    const rest = frontMatter[1].replace(titleLine[0], '').trim();
    const code = source.slice(frontMatter[0].length);
    return { title: unquoted(titleLine[1]), code: rest ? `---\n${rest}\n---\n${code}` : code };
  }
  const accessible = source.match(/^[ \t]*accTitle:[ \t]*(.+)$/m);
  return { title: accessible ? unquoted(accessible[1]) : '', code: source };
}

function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return;
      const { title, code } = mermaidTitle(node.value);
      const attribute = title ? ` data-notes-title="${escapeHtml(title).replaceAll('"', '&quot;')}"` : '';
      parent.children[index] = { type: 'html', value: `<pre class="mermaid"${attribute}>${escapeHtml(code)}</pre>` };
    });
  };
}

function codeLanguage(code) {
  const classes = code.properties.className ?? [];
  const languageClass = classes.find((name) => String(name).startsWith('language-'));
  return languageClass ? String(languageClass).slice('language-'.length) : 'text';
}

// A line break has no height of its own, so CSS cannot put space after it. An empty element after
// each break carries that space: the lines of one paragraph that the author broke stand apart.
// A table cell is too dense for that, and its breaks stay plain.
function rehypeBreakGaps() {
  return (tree) => {
    const breaks = [];
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'td' || node.tagName === 'th' || node.tagName === 'pre') return 'skip';
      if (node.tagName === 'br' && parent) breaks.push({ index, parent });
    });
    // From the end, so that an insertion does not move the breaks before it.
    for (const { index, parent } of breaks.reverse()) {
      parent.children.splice(index + 1, 0, {
        type: 'element',
        tagName: 'span',
        properties: { className: ['notes-break'] },
        children: [],
      });
    }
  };
}

function rehypeCodeBlocks({ highlight }) {
  return async (tree) => {
    const blocks = [];
    visit(tree, 'element', (node, index, parent) => {
      const code = node.children[0];
      if (node.tagName === 'pre' && code?.tagName === 'code') blocks.push({ code, index, parent });
    });

    for (const { code, index, parent } of blocks) {
      const text = code.children.map((child) => child.value ?? '').join('').replace(/\n$/, '');
      const highlighted = await highlight(text, codeLanguage(code));
      const copyButton = `<button class="notes-code-copy" type="button" aria-label="Copy code" title="Copy code">${copyIcon}</button>`;
      parent.children[index] = { type: 'raw', value: `<div class="notes-code">${highlighted}${copyButton}</div>` };
    }
  };
}

export async function createNoteRenderer({ root = notesRoot, cacheRoot = path.join(siteRoot, 'notes') } = {}) {
  // A change to the renderer code, to any dependency version, or to the config file, which may
  // add Markdown plugins, invalidates every cached note.
  const config = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  const hash = crypto.createHash('sha256').update(hashFiles(rendererFiles)).update(config).digest('hex');
  const starlight = await loadStarlightPlugins(outRoot, hash);
  const starlightOptions = {
    starlightConfig: { markdown: { headingLinks: true, processedDirs: [root] } },
    astroConfig: { root: pathToFileURL(`${packageRoot}/`), srcDir: pathToFileURL(`${packageRoot}/src/`) },
    useTranslations: () => translate,
    absolutePathToLang: () => 'en',
  };
  const highlight = await createCodeHighlighter();
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    remarkPlugins: [
      remarkBreaks,
      remarkLocalLinks,
      ...options.remarkPlugins,
      remarkIconLists,
      remarkMermaid,
      ...starlight.starlightRemarkPlugins(starlightOptions),
      starlight.remarkDirectivesRestoration,
    ],
    rehypePlugins: [
      [rehypeCodeBlocks, { highlight }],
      rehypeBreakGaps,
      ...starlight.starlightRehypePlugins(starlightOptions),
    ],
  });

  async function render(file) {
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const key = crypto.createHash('sha256').update(`${hash}\0${relativePath}\0${source}`).digest('hex');
    const cacheFile = path.join(cacheRoot, `${relativePath}.json`);
    const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : undefined;
    if (cached?.key === key) return { html: cached.html, headings: cached.headings };

    const { body } = parseFrontmatter(source, relativePath);
    const { code, metadata } = await processor.render(body, { fileURL: pathToFileURL(file) });
    const rendered = { html: code, headings: metadata.headings };
    writeFileAtomically(cacheFile, JSON.stringify({ key, ...rendered }));
    return rendered;
  }

  return { render };
}
