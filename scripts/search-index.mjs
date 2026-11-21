import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

import { writeFileAtomically } from './files.mjs';
import { outRoot, packageRoot } from './paths.mjs';

const defaultSearchRoot = path.join(outRoot, 'pagefind');
const runFile = promisify(execFile);

// The CLI indexes pages from disk about twice as fast as the Node API; the package exports no lookup for it.
function pagefindBinary() {
  const require = createRequire(path.join(packageRoot, 'package.json'));
  return require.resolve(`@pagefind/${process.platform}-${process.arch}/bin/pagefind_extended`);
}

export function currentSearchDir(searchRoot = defaultSearchRoot) {
  const pointer = path.join(searchRoot, 'current');
  if (!fs.existsSync(pointer)) return;
  return path.join(searchRoot, fs.readFileSync(pointer, 'utf8'));
}

// Pagefind has no incremental update, so every change indexes all note pages again.
export async function buildSearchIndex({ pagesRoot, searchRoot = defaultSearchRoot }) {
  const previous = currentSearchDir(searchRoot);
  const name = `${Date.now()}-${process.pid}`;
  const outputPath = path.join(searchRoot, name);
  await runFile(pagefindBinary(), ['--site', pagesRoot, '--output-path', outputPath, '--silent'], {
    maxBuffer: 16 * 1024 * 1024,
  });

  writeFileAtomically(path.join(searchRoot, 'current'), name);
  // A browser may still be loading fragments from the previous index, so that one stays.
  for (const entry of fs.readdirSync(searchRoot)) {
    const keep = [name, path.basename(previous ?? ''), 'current'].includes(entry);
    if (!keep) fs.rmSync(path.join(searchRoot, entry), { recursive: true, force: true });
  }
  return outputPath;
}
