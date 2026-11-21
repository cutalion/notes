#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const usage = `Usage: notes <command> [dir] [options]

Run it from the root of a repository. It renders the Markdown notes in [dir] (default: docs)
and writes everything it builds to a hidden folder there.

Commands:
  dev      Serve the notes and update the site when a note changes
  build    Render every note and report the broken local links
  serve    Build, then serve the result without watching

Options:
  --port <number>   Port of the site (default: 4321, or the next free one)
  --title <text>    Site title (default: "<repo folder> Notes")
  --out <dir>       Folder for everything the tool builds (default: .notes)
  --strict          Fail the build on a broken local link, not only warn

The same options can live in notes.config.mjs in the repository root. The command line wins.
`;

const scriptsRoot = fileURLToPath(new URL('../scripts/', import.meta.url));
const steps = { dev: ['dev.mjs'], build: ['build.mjs'], serve: ['build.mjs', 'preview.mjs'] };

function fail(message) {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      title: { type: 'string' },
      out: { type: 'string' },
      strict: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (error) {
  fail(error.message);
}

const [command, dir, ...extra] = parsed.positionals;
if (parsed.values.help) {
  console.log(usage);
  process.exit(0);
}
if (!steps[command]) fail(command ? `Unknown command: ${command}` : 'A command is required.');
if (extra.length > 0) fail(`Unexpected argument: ${extra[0]}`);

// The options travel in the environment, so the Astro build that a script starts sees them too.
const commandLine = {
  NOTES_DIR: dir,
  NOTES_PORT: parsed.values.port,
  NOTES_TITLE: parsed.values.title,
  NOTES_OUT: parsed.values.out,
  NOTES_STRICT: parsed.values.strict ? '1' : undefined,
};
const given = Object.fromEntries(Object.entries(commandLine).filter(([, value]) => value !== undefined));
const env = { ...process.env, ...given, ASTRO_TELEMETRY_DISABLED: '1' };

// Each step is its own process with a small heap, because the server stays up for days.
function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=128', path.join(scriptsRoot, script)], { env, stdio: 'inherit' });
    const forward = (signal) => child.kill(signal);
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.once('exit', (code) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve(code ?? 1);
    });
  });
}

for (const script of steps[command]) {
  const code = await run(script);
  if (code !== 0) process.exit(code);
}
