import path from 'node:path';

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import { options, outRoot } from './scripts/paths.mjs';
import { shellSidebar } from './scripts/shell.mjs';

const source = (relative) => path.join(outRoot, 'src', relative);
// Astro builds only the shell: pages with markers, which `scripts/shell.mjs` fills with each note.
// `scripts/shell.mjs` runs it in the output folder, which mirrors the package through links.
// Paths go through those links, so that every module path stays inside the Astro root.
export default defineConfig({
  output: 'static',
  srcDir: source(''),
  publicDir: path.join(outRoot, 'public'),
  cacheDir: path.join(outRoot, 'shell', 'astro'),
  vite: { cacheDir: path.join(outRoot, 'shell', 'vite'), resolve: { preserveSymlinks: true } },
  integrations: [
    starlight({
      title: options.title,
      description: options.description,
      markdown: {
        processedDirs: [source('shell')],
      },
      sidebar: shellSidebar,
      pagefind: true,
      lastUpdated: false,
      pagination: false,
      credits: false,
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-high-contrast'],
        useStarlightDarkModeSwitch: true,
        useStarlightUiThemeColors: false,
      },
      customCss: [source('styles/notes.css'), source('styles/code.css')],
      components: {
        Head: source('components/Head.astro'),
        Header: source('components/Header.astro'),
        Pagination: source('components/Pagination.astro'),
        Sidebar: source('components/Sidebar.astro'),
      },
      head: [
        {
          tag: 'meta',
          attrs: { name: 'robots', content: 'noindex,nofollow,noarchive' },
        },
      ],
    }),
  ],
});
