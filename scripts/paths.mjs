import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveOptions } from './options.mjs';

// The tool runs from the root of the repository whose notes it renders.
export const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const repoRoot = process.cwd();

export const configFile = path.join(repoRoot, 'notes.config.mjs');
const config = fs.existsSync(configFile) ? (await import(pathToFileURL(configFile).href)).default : {};

export const options = resolveOptions({ repoRoot, config, env: process.env });
export const notesRoot = options.dir;
// Everything the tool writes goes here: the Astro project root, the caches, and the built pages.
export const outRoot = options.out;

// npm may install a dependency inside the package or in a folder above it.
export function dependencyRoot(name) {
  for (let directory = packageRoot; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules', name);
    if (fs.existsSync(candidate)) return candidate;
    if (directory === path.dirname(directory)) throw new Error(`Dependency ${name} is not installed`);
  }
}
