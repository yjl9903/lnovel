import { createConsola } from 'consola';

import type { AuthorResult } from 'bilinovel';

import { Provider } from '../constants';

export const consola = createConsola().withTag(Provider.bilinovel);

export async function tryResult<T, E>(
  ok: () => Promise<T>,
  err: (error: unknown) => E
): Promise<T | E> {
  try {
    const data = await ok();
    return data;
  } catch (error) {
    return err(error);
  }
}

export function normalizeDescription(text: string) {
  return escape(text.replace(/<br>\s*/g, ' '));
}

export function transformImgSrc(origin: string, _url: string) {
  try {
    if (_url.startsWith('/files/')) {
      _url = 'https://www.linovelib.com' + _url;
    }

    const url = new URL(_url);
    if (url.host === 'img3.readpai.com') {
      return new URL(`/bili/img3${url.pathname}${url.search}`, origin).toString();
    }
    if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
      return new URL(`/bili${url.pathname}${url.search}`, origin).toString();
    }

    return _url;
  } catch (error) {
    consola.error('Transform img src', error, _url);
    return _url;
  }
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
