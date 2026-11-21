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
    remarkPlugins: [],
  };
  const fromCommandLine = {
    dir: env.NOTES_DIR,
    out: env.NOTES_OUT,
    title: env.NOTES_TITLE,
    port: env.NOTES_PORT,
  };
  const given = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  const options = { ...defaults, ...given(config), ...given(fromCommandLine) };

  return {
    ...options,
    dir: path.resolve(repoRoot, options.dir),
    out: path.resolve(repoRoot, options.out),
    port: Number(options.port),
    // A server may move to the next free port only when nobody asked for this one.
    portIsDefault: config.port === undefined && env.NOTES_PORT === undefined,
  };
}
