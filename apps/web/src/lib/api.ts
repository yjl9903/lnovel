import { createIsomorphicFn } from '@tanstack/react-start';

export const apiFetch = createIsomorphicFn()
  .server(async (path: string, signal?: AbortSignal) => {
    const [{ getRequest }, { serverApp }, { createApiRequest }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('../server/api.server'),
      import('../server/api-request')
    ]);
    return serverApp.fetch(createApiRequest(getRequest(), path, signal));
  })
  .client((path: string, signal?: AbortSignal) =>
    fetch(path, { headers: { Accept: 'application/json' }, signal })
  );
