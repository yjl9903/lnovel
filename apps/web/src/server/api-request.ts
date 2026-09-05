export function createApiRequest(incoming: Request, path: string, signal?: AbortSignal) {
  const headers = new Headers();
  for (const name of ['cookie', 'authorization', 'x-forwarded-host', 'x-forwarded-proto']) {
    const value = incoming.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Accept', 'application/json');
  return new Request(new URL(path, incoming.url), {
    headers,
    signal: signal ? AbortSignal.any([incoming.signal, signal]) : incoming.signal
  });
}
