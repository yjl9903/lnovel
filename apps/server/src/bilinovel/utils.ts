import { consola as globalConsola } from 'consola';

import type { Context } from '../app';
import { Provider } from '../constants';

export const consola = globalConsola.withTag(Provider.bilinovel);

export function buildSite(c: Context, path: string) {
  const requestUrl = new URL(c.req.url);

  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();

  const proto = forwardedProto || requestUrl.protocol.replace(/:$/, '');
  const host = forwardedHost || requestUrl.host;

  const origin = `${proto}://${host}`;

  return new URL(path, origin).toString();
}

export function normalizeDescription(text: string) {
  return escape(text.replace(/<br>\s*/g, ' '));
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
