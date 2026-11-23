import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

const codeThemes = { light: 'github-light-high-contrast', dark: 'github-dark-default' };

// The page script in `Head.astro` copies the text of the `pre` that stands beside this button.
export const codeCopyButton = '<button class="notes-code-copy" type="button" aria-label="Copy code" title="Copy code"><svg aria-hidden="true" viewBox="0 0 24 24"><rect width="13" height="13" x="8" y="8" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button>';

// One highlighter with the JavaScript regex engine; it loads each language on first use.
export async function createCodeHighlighter() {
  const highlighter = await createHighlighterCore({
    themes: [import('shiki/themes/github-light-high-contrast.mjs'), import('shiki/themes/github-dark-default.mjs')],
    engine: createJavaScriptRegexEngine(),
  });

  return async function highlight(text, requestedLanguage, transformers = []) {
    const language = requestedLanguage in bundledLanguages ? requestedLanguage : 'text';
    if (language !== 'text') await highlighter.loadLanguage(bundledLanguages[language]);
    return highlighter.codeToHtml(text, { lang: language, themes: codeThemes, defaultColor: false, transformers });
  };
}
