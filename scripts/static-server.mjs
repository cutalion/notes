import fs from 'node:fs';
import path from 'node:path';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveStaticFile(root, requestPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestPath, 'http://localhost').pathname);
  } catch {
    return;
  }
  const relative = pathname.replace(/^\/+/, '');
  const candidates = pathname.endsWith('/')
    ? [path.join(relative, 'index.html')]
    : path.extname(relative)
      ? [relative]
      : [path.join(relative, 'index.html'), `${relative}.html`];

  for (const candidate of candidates) {
    const absolute = path.resolve(root, candidate);
    if (!contained(root, absolute)) return;
    if (fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) return absolute;
  }
}

export function contentType(file) {
  if (path.basename(file).startsWith('wasm.') && file.endsWith('.pagefind')) return 'application/wasm';
  return contentTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
}

export function sendFile(request, response, file, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType(file));
  if (path.extname(file).toLowerCase() === '.md') response.setHeader('Content-Disposition', 'inline');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'HEAD') return response.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  stream.pipe(response);
}
