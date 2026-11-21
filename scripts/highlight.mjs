import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

const codeThemes = { light: 'github-light-high-contrast', dark: 'github-dark-default' };

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
