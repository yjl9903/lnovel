import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestLogging, createLogger } from '@lnovel/server/logging';

import { robots, sitemap } from './seo';

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export function createGateway(options: {
  apiFetch: FetchHandler;
  startFetch: FetchHandler;
  assets?: MiddlewareHandler;
}) {
  const app = new Hono<{ Variables: { logStaticAsset: boolean } }>();

  app.use('*', requestLogging('web'));

  app.onError((error, c) => {
    createLogger('web').error('Gateway failed', { event: 'web.failed' }, error);
    if (error instanceof HTTPException) return error.getResponse();
    return c.text('Internal Server Error', 500);
  });

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

  app.all('/api', (c) => forward(c.req.raw));
  app.all('/api/*', (c) => forward(c.req.raw));

  // Reserve only existing feeds and images; other /bili paths belong to pages.
  for (const path of [
    '/bili/novels/feed.xml',
    '/bili/wenku/feed.xml',
    '/bili/top/:sort/feed.xml',
    '/bili/novel/:nid/feed.xml',
    '/bili/novel/:nid/vol/:vid/feed.xml',
    '/bili/files/*',
    '/bili/img3/*'
  ]) {
    app.all(path, (c) => forward(c.req.raw));
  }

  if (options.assets) {
    const assets = options.assets;
    app.use('*', async (c, next) => {
      let forwarded = false;
      const result = await assets(c, async () => {
        forwarded = true;
        await next();
      });
      if (!forwarded) c.set('logStaticAsset', true);
      return result;
    });
  }

  app.all('*', (c) => options.startFetch(c.req.raw));

  return app;
}
