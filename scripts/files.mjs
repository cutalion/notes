import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { packageRoot } from './paths.mjs';

// A cache keyed by this hash goes stale when any of the given package files changes.
export function hashFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) hash.update(fs.readFileSync(path.join(packageRoot, file)));
  return hash.digest('hex');
}

// The dev server and the build share the cache, so a reader must never see a half-written file.
export function writeFileAtomically(file, contents) {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporaryFile, contents);
  fs.renameSync(temporaryFile, file);
}
