import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { writeFileAtomically } from './files.mjs';
import { dependencyRoot, notesRoot, options, outRoot, packageRoot, repoRoot, siteRoot } from './paths.mjs';

export const shellSidebar = [
  { label: 'notessidebarmarker', link: '/notessidebarmarker/' },
  { label: 'notesgroupmarker', collapsed: true, items: [{ label: 'notesitemmarker', link: '/notesitemmarker/' }] },
];

const shellRoot = path.join(outRoot, 'shell');
const shellPage = path.join('notespathmarker', 'index.html');
const sourceShellPage = path.join('source', 'sourcepathmarker', 'index.html');
const shellInputs = ['astro.config.mjs', 'package.json', 'scripts', 'src'];
const notesFolder = path.relative(repoRoot, notesRoot).split(path.sep).join('/');
// Each table of contents (desktop and mobile) starts with Overview; nested lists repeat the list class.
const tocMarkerItems = /<ul class="([^"]+)" style="--depth: 0;"><li style="--depth: 0;" class="([^"]+)"><a href="#_top"[\s\S]*?<a href="#notestocmarker"[\s\S]*?<\/li>/g;
const contentMarker = /<div class="sl-heading-wrapper level-h2"><h2 id="notestocmarker">[\s\S]*?<p>notescontentmarker<\/p>/;
const runFile = promisify(execFile);

export function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function filesUnder(entry) {
  const absolute = path.join(packageRoot, entry);
  if (!fs.statSync(absolute).isDirectory()) return [entry];
  return fs.readdirSync(absolute).sort().flatMap((name) => filesUnder(path.join(entry, name)));
}

// Any change to the site code, a dependency version, or the texts on the shell page builds a new shell.
function shellHash() {
  const hash = crypto.createHash('sha256');
  hash.update(`${options.title}\0${options.description}\0`);
  for (const file of shellInputs.flatMap(filesUnder)) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(packageRoot, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

// A link that is already right stays, because another process may be building the shell through it.
function link(name, target) {
  const file = path.join(outRoot, name);
  const current = fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() ? fs.readlinkSync(file) : undefined;
  if (current === target) return;
  fs.rmSync(file, { force: true });
  try {
    fs.symlinkSync(target, file);
  } catch (error) {
    // Another process made the same link first.
    if (error.code !== 'EEXIST') throw error;
  }
}

// Astro writes `.astro/` into its project root, so the output folder is that root. Astro also
// misreads a module that shares no parent folder with the root, which happens when the package
// is installed system-wide. So the output folder mirrors the package through links, and Astro
// runs there with symlinks preserved: every module it loads then has a path inside its root.
function prepareAstroRoot() {
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, '.gitignore'), '*\n');
  for (const name of ['astro.config.mjs', 'public', 'scripts', 'src']) link(name, path.join(packageRoot, name));
  link('node_modules', path.dirname(dependencyRoot('astro')));
}

async function buildShell(outDir) {
  const temporaryDir = `${outDir}.${process.pid}.tmp`;
  const astro = path.join(outRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const keepLinks = ['--preserve-symlinks', '--preserve-symlinks-main'];
  await runFile(process.execPath, [...keepLinks, astro, 'build', '--root', outRoot, '--outDir', temporaryDir], {
    cwd: repoRoot,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    fs.renameSync(temporaryDir, outDir);
  } catch (error) {
    // Another process may have finished the same shell first; its copy is identical.
    if (!fs.existsSync(outDir)) throw error;
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

// Another notes folder of the repository can run with another title, and so with another shell.
function shellsInUse() {
  const sitesRoot = path.dirname(siteRoot);
  const pointers = fs.readdirSync(sitesRoot).map((site) => path.join(sitesRoot, site, 'shell'));
  return new Set(pointers.filter((pointer) => fs.existsSync(pointer)).map((pointer) => fs.readFileSync(pointer, 'utf8')));
}

export async function ensureShell() {
  prepareAstroRoot();
  const hash = shellHash();
  const root = path.join(shellRoot, hash);
  if (!fs.existsSync(root)) await buildShell(root);
  writeFileAtomically(path.join(siteRoot, 'shell'), hash);
  const used = shellsInUse();
  for (const name of fs.readdirSync(shellRoot)) {
    const stale = !used.has(name) && !['astro', 'vite'].includes(name) && !name.endsWith('.tmp');
    if (stale) fs.rmSync(path.join(shellRoot, name), { recursive: true, force: true });
  }
  return {
    root,
    template: fs.readFileSync(path.join(root, shellPage), 'utf8'),
    sourceTemplate: fs.readFileSync(path.join(root, sourceShellPage), 'utf8'),
  };
}

function nestTocItem(items, item) {
  const last = items.at(-1);
  if (!last || last.depth >= item.depth) items.push(item);
  else nestTocItem(last.children, item);
}

// Starlight's rule: Overview is a second-level item, and a deeper heading nests under the item before it.
function tocTree(headings) {
  const items = [{ depth: 2, slug: '_top', text: 'Overview', children: [] }];
  for (const heading of headings) {
    if (heading.depth >= 2 && heading.depth <= 3) nestTocItem(items, { ...heading, children: [] });
  }
  return items;
}

function tocHtml(items, listClass, className, depth = 0) {
  const style = `style="--depth: ${depth};"`;
  return items.map((item) => {
    const link = `<a href="#${item.slug}" ${style} class="${className}"><span ${style} class="${className}">${escapeHtml(item.text)}</span></a>`;
    const children = item.children.length > 0
      ? `<ul class="${listClass}" style="--depth: ${depth + 1};">${tocHtml(item.children, listClass, className, depth + 1)}</ul>`
      : '';
    return `<li ${style} class="${className}">${link}${children}</li>`;
  }).join('');
}

// A generated page has no Markdown file behind it, so it loses the block with the copy buttons.
function withoutCopyActions(page) {
  const start = page.indexOf('<div class="notes-copy-actions ');
  if (start === -1) throw new Error('The shell page has no copy actions');
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(page); match; match = tag.exec(page)) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return page.slice(0, start) + page.slice(tag.lastIndex);
  }
  throw new Error('The copy actions of the shell page do not close');
}

export function fillShell(template, { title, description, relativePath, html, headings, generated = false }) {
  if (!contentMarker.test(template)) throw new Error('The shell page has no content marker');
  if (generated) template = withoutCopyActions(template);
  const rawUrl = `/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
  const toc = tocTree(headings);

  return template
    .replace(tocMarkerItems, (_, listClass, className) => `<ul class="${listClass}" style="--depth: 0;">${tocHtml(toc, listClass, className)}`)
    .replace(contentMarker, () => html)
    .replaceAll('notestitlemarker', () => escapeHtml(title))
    .replaceAll('notesdescriptionmarker', () => escapeHtml(description ?? options.description))
    .replaceAll('notesprojectpathmarker', () => escapeHtml(path.posix.join(notesFolder, relativePath)))
    .replaceAll('/notesrawurlmarker', () => rawUrl);
}
