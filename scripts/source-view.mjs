import path from 'node:path';

const languages = {
  '.css': 'css',
  '.csv': 'csv',
  '.graphql': 'graphql',
  '.html': 'html',
  '.js': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.py': 'python',
  '.rake': 'ruby',
  '.rb': 'ruby',
  '.sh': 'shellscript',
  '.sql': 'sql',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.txt': 'text',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

// Browsers only jump to an exact id. A `#L28-L33` link scrolls to L28 and marks the range.
const sourceRangeScript = `<script>(() => {
  const apply = () => {
    const range = location.hash.match(/^#L(\\d+)-L?(\\d+)$/);
    document.querySelectorAll('.source-code .line.is-range').forEach((line) => line.classList.remove('is-range'));
    if (!range) return;
    const [start, end] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
    for (let n = start; n <= end; n += 1) document.getElementById('L' + n)?.classList.add('is-range');
    document.getElementById('L' + start)?.scrollIntoView();
  };
  apply();
  addEventListener('hashchange', apply);
})();</script>`;

export const sourceLineAnchors = {
  name: 'source-line-anchors',
  line(node, line) {
    node.properties.id = `L${line}`;
  },
};

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function languageFor(file) {
  const basename = path.basename(file);
  return languages[path.extname(file).toLowerCase()]
    ?? (['Gemfile', 'Rakefile'].includes(basename) ? 'ruby' : 'text');
}

// `highlighted` is the shiki output, or undefined when the file is missing from the checkout.
export function sourceViewHtml(repoRelative, highlighted) {
  const sourcePath = escapeHtml(repoRelative);
  if (highlighted === undefined) {
    return `<div class="source-view" data-pagefind-ignore><p class="source-path">${sourcePath}</p><h2>Unavailable in this checkout</h2><p>The note links this repository path, but it is not an available text file in the current checkout. It may belong to another branch, a historical revision, or a directory that is intentionally not exposed.</p></div>`;
  }
  return `<div class="source-view" data-pagefind-ignore><p class="source-path">${sourcePath}</p><div class="source-code">${highlighted}</div></div>${sourceRangeScript}`;
}
