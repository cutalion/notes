import path from 'node:path';

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightFullviewMode from 'starlight-fullview-mode';

import { options, outRoot } from './scripts/paths.mjs';
import { shellSidebar } from './scripts/shell.mjs';

const source = (relative) => path.join(outRoot, 'src', relative);
const mermaidLoader = "import('mermaid').then(async ({ default: mermaid }) => {";

// astro-mermaid 2.1.0 leaves Mermaid's own start on page load switched on. That start races the
// integration's setup and renders the diagrams with the default config, so its page script gets
// one more line. The dependency is pinned, and a version without this loader fails the build.
function withoutStartOnLoad(integration) {
  const setup = integration.hooks['astro:config:setup'];
  integration.hooks['astro:config:setup'] = async (context) => {
    let patched = false;
    const injectScript = (stage, code) => {
      if (code.includes(mermaidLoader)) patched = true;
      context.injectScript(stage, code.replace(mermaidLoader, `${mermaidLoader}\n    mermaid.startOnLoad = false;`));
    };
    await setup({ ...context, injectScript });
    if (!patched) throw new Error('astro-mermaid no longer has the Mermaid loader that this config patches');
  };
  return integration;
}

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
    withoutStartOnLoad(mermaid({
      autoTheme: true,
      enableLog: false,
      mermaidConfig: {
        securityLevel: 'strict',
        layout: 'elk',
        flowchart: {
          defaultRenderer: 'elk',
        },
        state: {
          defaultRenderer: 'elk',
        },
        elk: {
          considerModelOrder: 'NONE',
          mergeEdges: false,
        },
      },
    })),
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
        PageTitle: source('components/PageTitle.astro'),
        Pagination: source('components/Pagination.astro'),
      },
      head: [
        {
          tag: 'meta',
          attrs: { name: 'robots', content: 'noindex,nofollow,noarchive' },
        },
      ],
      plugins: [
        starlightFullviewMode({
          leftSidebarEnabled: true,
          rightSidebarEnabled: true,
          leftSidebarExpandedWidth: 'var(--notes-left-sidebar-width)',
          rightSidebarExpandedWidth: 'var(--notes-right-sidebar-width)',
          leftSidebarCollapsedWidth: '2.75rem',
          rightSidebarCollapsedWidth: '2.75rem',
        }),
      ],
    }),
  ],
});
