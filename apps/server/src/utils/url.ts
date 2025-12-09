import type { Context } from '../app';

export function buildSite(c: Context, path: string) {
  const requestUrl = new URL(c.req.url);

  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();

  const proto = forwardedProto || requestUrl.protocol.replace(/:$/, '');
  const host = forwardedHost || requestUrl.host;

  const origin = `${proto}://${host}`;

  return new URL(path, origin).toString();
}

export function getFeedURL(c: Context) {
  try {
    const requestUrl = new URL(c.req.url);

    const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();

    const proto = forwardedProto || requestUrl.protocol.replace(/:$/, '');
    const host = forwardedHost || requestUrl.host;

    requestUrl.protocol = proto;
    requestUrl.host = host;

    // Remove ?ts=xxx
    requestUrl.searchParams.delete('ts');

    return requestUrl.toString();
  } catch {
    return c.req.url;
  }
}
