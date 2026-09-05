import { Hono, type MiddlewareHandler } from 'hono';

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export function createGateway(options: {
  apiFetch: FetchHandler;
  startFetch: FetchHandler;
  assets?: MiddlewareHandler;
}) {
  const app = new Hono();
  const forward = (request: Request) => options.apiFetch(request);
  app.all('/health', (c) => forward(c.req.raw));
  app.all('/bili', (c) => forward(c.req.raw));
  app.all('/bili/*', (c) => forward(c.req.raw));
  if (options.assets) app.use('*', options.assets);
  app.all('*', (c) => options.startFetch(c.req.raw));
  return app;
}
