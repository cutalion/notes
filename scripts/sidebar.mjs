import crypto from 'node:crypto';
import path from 'node:path';

import { buildSidebar } from './content.mjs';
import { writeFileAtomically } from './files.mjs';
import { notesRoot, outRoot } from './paths.mjs';

export const sidebarFile = path.join(outRoot, 'sidebar.json');

// The shell sidebar holds one top-level link and one group with one link, see `shellSidebar`.
const sidebarMarker = /<ul class="top-level [^"]+">[\s\S]*?notesitemmarker[\s\S]*?<\/ul><\/details><\/li><\/ul>/;
const topLevelLink = /<li class="[^"]+"><a href="\/notessidebarmarker\/"[\s\S]*?<\/li>/;
const group = /(<li class="[^"]+"><details class="[^"]+">[\s\S]*?)notesgroupmarker([\s\S]*?<sl-sidebar-restore data-index=")0("><\/sl-sidebar-restore><ul class="[^"]+">)(<li[\s\S]*?<\/li>)(<\/ul><\/details><\/li>)/;
const stateHash = /(<sl-sidebar-state-persist data-hash=")[^"]*"/;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function linkHtml(itemTemplate, marker, entry) {
  const attributes = Object.entries(entry.attrs ?? {})
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  return itemTemplate
    .replace(`href="/${marker}/"`, () => `href="${escapeHtml(entry.link)}"`)
    .replace(/(<a [^>]*class="[^"]+")>/, (_, start) => `${start}${attributes}>`)
    .replace(`>${marker}<`, () => `>${escapeHtml(entry.label)}<`);
}

export function renderSidebar(template, root = notesRoot) {
  const markup = template.match(sidebarMarker)?.[0];
  if (!markup) throw new Error('The shell page has no sidebar marker');
  const [, groupStart, groupLabelEnd, groupListStart, groupItem, groupEnd] = markup.match(group);
  const topLevelItem = markup.match(topLevelLink)[0];
  let groupIndex = 0;

  const items = buildSidebar(root).map((entry) => {
    if (!entry.items) return linkHtml(topLevelItem, 'notessidebarmarker', entry);
    const links = entry.items.map((item) => linkHtml(groupItem, 'notesitemmarker', item)).join('');
    return `${groupStart}${escapeHtml(entry.label)}${groupLabelEnd}${groupIndex++}${groupListStart}${links}${groupEnd}`;
  });
  const html = `${markup.match(/^<ul [^>]+>/)[0]}${items.join('')}</ul>`;
  return { html, hash: crypto.createHash('sha256').update(html).digest('hex').slice(0, 8) };
}

export function writeSidebar(template, root = notesRoot) {
  writeFileAtomically(sidebarFile, JSON.stringify(renderSidebar(template, root)));
}

// Marks the current note and opens its group, the way Starlight does for each page.
function markCurrent(html, route) {
  const link = `<a href="${escapeHtml(route)}" `;
  const linkIndex = html.indexOf(link);
  if (linkIndex === -1) return html;

  const marked = `${html.slice(0, linkIndex)}${link}aria-current="page" ${html.slice(linkIndex + link.length)}`;
  const groupIndex = marked.lastIndexOf('<details ', linkIndex);
  const insideGroup = groupIndex > marked.lastIndexOf('</details>', linkIndex);
  if (!insideGroup) return marked;
  return `${marked.slice(0, groupIndex)}<details open ${marked.slice(groupIndex + '<details '.length)}`;
}

export function insertSidebar(page, sidebar, route) {
  return page
    .replace(sidebarMarker, () => markCurrent(sidebar.html, route))
    .replace(stateHash, (_, start) => `${start}${sidebar.hash}"`);
}
