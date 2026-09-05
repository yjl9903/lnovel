import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

// Parse identically in SSR and browsers, but render only text, never upstream HTML.
export function descriptionToText(html: string): string {
  const visit = (node: DefaultTreeAdapterTypes.Node): string => {
    // Source formatting (including the newline after <br>) is HTML whitespace,
    // not another visible line break. Only markup below introduces newlines.
    if ('value' in node) return node.value.replace(/[\t\n\f\r ]+/g, ' ');
    if ('tagName' in node && ['script', 'style', 'template'].includes(node.tagName)) return '';
    if ('tagName' in node && node.tagName === 'br') return '\n';
    const text = 'childNodes' in node ? node.childNodes.map(visit).join('') : '';
    return 'tagName' in node && /^(p|div|li|h[1-6]|blockquote)$/.test(node.tagName)
      ? `\n${text}\n`
      : text;
  };
  return visit(parseFragment(html))
    .replace(/\u00a0/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
