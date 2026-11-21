import { fileURLToPath } from 'node:url';

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// The notes never pass through Astro. It builds the shell pages, which `scripts/shell.mjs` fills.
export const collections = {
  docs: defineCollection({
    loader: glob({
      base: fileURLToPath(new URL('./shell/', import.meta.url)),
      pattern: ['notespathmarker.md', 'source/sourcepathmarker.md'],
    }),
    schema: docsSchema(),
  }),
};
