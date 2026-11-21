import { visit } from 'unist-util-visit';

// A list item that opens with an emoji or a symbol (✅ ⚠️ ❌ → …) carries its own marker.
const LEADING_ICON = /^\s*(?:\p{Extended_Pictographic}|\p{So})/u;

function leadingText(node) {
  if (typeof node.value === 'string') return node.value;
  if (!Array.isArray(node.children) || node.children.length === 0) return '';
  return leadingText(node.children[0]);
}

export function remarkIconLists() {
  return (tree) => {
    visit(tree, 'list', (node) => {
      if (node.ordered || node.children.length === 0) return;
      if (!node.children.every((item) => LEADING_ICON.test(leadingText(item)))) return;

      node.data ??= {};
      node.data.hProperties ??= {};
      const classes = String(node.data.hProperties.className ?? '').split(/\s+/).filter(Boolean);
      node.data.hProperties.className = [...classes, 'icon-list'].join(' ');
    });
  };
}
