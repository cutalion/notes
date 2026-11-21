import { defaultPagesRoot } from './pages.mjs';
import { options } from './paths.mjs';
import { createSourceRenderer } from './render-source.mjs';
import { ensureShell } from './shell.mjs';
import { createSiteHandler, startSiteServer } from './site-server.mjs';

const host = '127.0.0.1';
const { root: shellRoot } = await ensureShell();
const sourceRenderer = await createSourceRenderer();
const handler = createSiteHandler({ shellRoot, pagesRoot: defaultPagesRoot, sourceRenderer });
const server = await startSiteServer({ handler, host, port: options.port, orNextFree: options.portIsDefault });

console.log(`[notes] Built site: http://${host}:${server.address().port}/`);

const stop = () => server.close();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
