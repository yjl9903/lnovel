import { Hono, type MiddlewareHandler } from 'hono';
import { robots, sitemap } from './seo';

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export function createGateway(options: {
  apiFetch: FetchHandler;
  startFetch: FetchHandler;
  assets?: MiddlewareHandler;
}) {
  const app = new Hono();
  app.get('/robots.txt', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.text(robots);
  });
  app.get('/sitemap.xml', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('Content-Type', 'application/xml; charset=utf-8');
    return c.body(sitemap);
  });
  const forward = (request: Request) => options.apiFetch(request);
  app.all('/health', (c) => forward(c.req.raw));
  app.all('/bili', (c) => forward(c.req.raw));
  app.all('/bili/*', (c) => forward(c.req.raw));
  if (options.assets) app.use('*', options.assets);
  app.all('*', (c) => options.startFetch(c.req.raw));
  return app;
}
