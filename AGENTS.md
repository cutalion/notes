# AGENTS.md

`notes` is a command-line tool that renders a folder of Markdown files as a local site. `README.md` describes it for a user. This file is for an agent that changes the tool itself. To write notes with the tool, read `skills/notes/SKILL.md`.

## How it works

The site looks like Astro with Starlight, but Astro does not render the notes.

1. **The shell.** Astro builds one template page from `src/shell/` with markers in place of the title, the body, the sidebar, and the contents. This runs on the first start and after a change in `src/`, in `public/`, or in the dependencies. It takes about five seconds.
2. **The notes.** `scripts/` renders each note to HTML with remark and Shiki and fills the shell with it (`scripts/shell.mjs`, `scripts/render-note.mjs`, `scripts/pages.mjs`). This takes about a second and needs no Astro.

So a change to the look or the behaviour of the page goes into `src/`, and a change to what a note becomes goes into `scripts/`.

| Path | What is there |
| --- | --- |
| `bin/notes.mjs` | The command line: `dev`, `build`, `serve` |
| `scripts/` | Rendering of notes and source pages, links, sidebar, search index, servers |
| `src/components/` | Starlight overrides: `Head`, `Header`, `Sidebar`, `Pagination`, and `CopyActions` |
| `src/styles/notes.css` | The design tokens and almost all styles |
| `src/styles/code.css` | Code blocks |
| `tests/fixture/` | A small repository with notes in `docs/`. Every test uses it |
| `DESIGN_GUIDE.md` | The design rules. Read it before a change to the interface |

## Commands

```sh
npm run check          # unit tests, then the Astro and TypeScript check
npm run test:browser   # builds the fixture and drives the site in Chromium
npm run test:fixture   # starts the dev server, adds a note, checks the memory peak
```

Build the fixture site by hand, for example before a screenshot:

```sh
cd tests/fixture && node ../../bin/notes.mjs build --strict
```

The browser tests need a Chromium that Playwright can find. In a sandbox where the full Chromium cannot start, give them the headless shell:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell npm run test:browser
```

Run the unit tests and the browser tests before you say that a change works. A change to styles or scripts in `src/` is tested only by the browser tests.

## Design

`DESIGN_GUIDE.md` is the source of the rules, and the code follows it. If a change breaks a rule of the guide, change the guide in the same commit and say why.

- **Sizes come from tokens.** Every font size and space in `notes.css` is a `--notes-*` token, computed from `--notes-text`. Do not write a new pixel or rem value where a token fits.
- **Colours come from tokens.** Use `--notes-color-*`. Each has a dark value on `:root` and a light value on `:root[data-theme='light']`. Check both themes.
- **Starlight styles sit in CSS layers.** Any rule outside a layer wins over them, so `notes.css` needs no `!important` against Starlight. Mermaid is different: it scopes its theme by the id of each diagram, and only `!important` gets past it.
- **The text column has a fixed width.** Only tables and diagrams may grow out of it, and only when they do not fit.

## Things that are easy to break

- **The state of the page is on the root element.** The inline script in `Head.astro` reads `localStorage` and sets `data-notes-tree`, `data-notes-toc`, and the panel widths before the first paint. Anything that must not flash on load goes there, not into a deferred script.
- **A heading must stay the first child of `.sl-heading-wrapper`.** Starlight styles it by that. The fold mark is appended after it for this reason.
- **A script that measures must run again after an unfold.** A folded section is `display: none`, so a diagram or a table in it has no size. Unfolding sends a `resize` event to the window, and the code that measures listens to it.
- **Generated pages have no copy button.** `withoutCopyActions()` in `scripts/shell.mjs` cuts the block that starts with `<div class="notes-copy-actions `. Keep that opening tag as it is, or change both places.
- **The markers in the shell are plain strings**, such as `notespathmarker` and `notestitlemarker`. `scripts/shell.mjs` replaces them, and a component must not change them on the way.
- **Mermaid is served, not bundled.** The page script in `Head.astro` imports `/_mermaid/` and `/_mermaid-layout-elk/` by a path in a variable, and `scripts/site-server.mjs` serves those paths from the `dist` folders of the two packages. An import that Vite can follow puts the library back into the shell build, which then takes twice the time and the memory.
- **A Mermaid title is taken at build time.** `mermaidTitle()` in `scripts/render-note.mjs` moves a front matter `title` out of the source, so that the picture does not repeat the header of its block. The copy button must still give the source with the title, so such a diagram carries the whole source in `data-notes-source`.
- **A folded diagram has no size.** `fit()` in `Head.astro` skips it and runs when the diagram unfolds. A diagram is remembered as folded by a hash of its source.

## Conventions

- **Comments** say why the code is as it is, in full plain sentences. Do not describe what the next line does.
- **Tests** name a behaviour that a reader sees, for example "a wide table or diagram grows into the margins, and scrolls only past them". A browser test waits for a state with `waitFor` or `waitForFunction`, never for a fixed time.
- **The fixture is the sample.** `tests/fixture/docs/guide/order-lifecycle.md` is a long note with every kind of block. Add a new kind of content there, so that the tests and the screenshots can use it.
- **Commits** have an imperative subject without a prefix, for example "Fold a section by its heading", and a body that says what changed for the reader of the site.
- **Dependencies** are pinned to exact versions.
- **The screenshots in the README** live in `.github/screenshots/` and show the fixture site. Take them again after a visible change to the layout.
