import path from 'node:path';

// Defaults give way to `notes.config.mjs`, and that file gives way to the command line, which
// reaches every process of the tool through the environment.
export function resolveOptions({ repoRoot, config = {}, env = {} }) {
  const repoName = path.basename(repoRoot);
  const defaults = {
    dir: 'docs',
    out: '.notes',
    title: `${repoName} Notes`,
    description: `Notes of ${repoName}`,
    port: 4321,
    strict: false,
    remarkPlugins: [],
  };
  const fromCommandLine = {
    dir: env.NOTES_DIR,
    out: env.NOTES_OUT,
    title: env.NOTES_TITLE,
    port: env.NOTES_PORT,
    strict: env.NOTES_STRICT === undefined ? undefined : env.NOTES_STRICT === '1',
  };
  const given = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  const options = { ...defaults, ...given(config), ...given(fromCommandLine) };

  const dir = path.resolve(repoRoot, options.dir);
  const out = path.resolve(repoRoot, options.out);
  // Each notes folder keeps its pages and caches apart, so two folders of one repository can be served at once.
  const siteName = (path.relative(repoRoot, dir) || 'root').replaceAll('..', 'up').replace(/[^\w.-]+/g, '-');

  return {
    ...options,
    dir,
    out,
    site: path.join(out, 'sites', siteName),
    port: Number(options.port),
    // A server may move to the next free port only when nobody asked for this one.
    portIsDefault: config.port === undefined && env.NOTES_PORT === undefined,
  };
}
