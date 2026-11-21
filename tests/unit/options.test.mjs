import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOptions } from '../../scripts/options.mjs';

test('a repository without a config file gets useful defaults', () => {
  assert.deepEqual(resolveOptions({ repoRoot: '/work/shop-api' }), {
    dir: '/work/shop-api/docs',
    out: '/work/shop-api/.notes',
    site: '/work/shop-api/.notes/sites/docs',
    title: 'shop-api Notes',
    description: 'Notes of shop-api',
    port: 4321,
    portIsDefault: true,
    strict: false,
    remarkPlugins: [],
  });
});

test('the config file overrides the defaults, and the command line overrides the file', () => {
  const plugin = () => {};
  const options = resolveOptions({
    repoRoot: '/work/shop-api',
    config: { dir: 'team/docs', title: 'Shop Notes', port: 5000, remarkPlugins: [plugin] },
    env: { NOTES_DIR: 'handbook', NOTES_PORT: '5001' },
  });

  assert.equal(options.dir, '/work/shop-api/handbook');
  assert.equal(options.title, 'Shop Notes');
  assert.equal(options.port, 5001);
  assert.equal(options.portIsDefault, false);
  assert.deepEqual(options.remarkPlugins, [plugin]);
});

test('broken links fail the build only when the config file or the command line asks', () => {
  const repoRoot = '/work/shop-api';
  assert.equal(resolveOptions({ repoRoot, config: { strict: true } }).strict, true);
  assert.equal(resolveOptions({ repoRoot, env: { NOTES_STRICT: '1' } }).strict, true);
});

test('each notes folder gets its own folder for pages and caches', () => {
  const site = (dir) => resolveOptions({ repoRoot: '/work/shop-api', env: { NOTES_DIR: dir } }).site;

  assert.equal(site('team/docs'), '/work/shop-api/.notes/sites/team-docs');
  assert.equal(site('.'), '/work/shop-api/.notes/sites/root');
  assert.equal(site('../handbook'), '/work/shop-api/.notes/sites/up-handbook');
});
