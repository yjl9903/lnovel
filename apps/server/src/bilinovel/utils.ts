import { consola as globalConsola } from 'consola';

import type { AuthorResult } from 'bilinovel';

import { Provider } from '../constants';

export const consola = globalConsola.withTag(Provider.bilinovel);

export function normalizeDescription(text: string) {
  return escape(text.replace(/<br>\s*/g, ' '));
}

export function transformAuthor(author: AuthorResult) {
  return {
    name: author.name,
    link: `https://www.linovelib.com/${author.position}article/${author.name}.html`
  };
}

export function escape(text: string): string {
  if (text === '' || text == null) return '';

  return String(text).replace(/[&<>]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&#x26;';
      case '<':
        return '&#x3C;';
      case '>':
        return '&#x3E;';
      default:
        return ch;
    }
  });
}
