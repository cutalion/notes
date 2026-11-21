import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOptions } from '../../scripts/options.mjs';

test('a repository without a config file gets useful defaults', () => {
  assert.deepEqual(resolveOptions({ repoRoot: '/work/shop-api' }), {
    dir: '/work/shop-api/docs',
    out: '/work/shop-api/.notes',
    title: 'shop-api Notes',
    description: 'Notes of shop-api',
    port: 4321,
    portIsDefault: true,
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
