import path from 'node:path';
import { readFileSync } from 'node:fs';

import { serve } from '@hono/node-server';

import { serveStatic } from '@hono/node-server/serve-static';

import { consola, createApp as createServerApp } from './app';

export function createApp() {
  const app = createServerApp();

  const landingRoot = path.join(import.meta.dirname, '../public');
  const landingIndexPath = path.join(landingRoot, 'index.html');

  let cachedLandingHtml: string | null = null;

  const getLandingHtml = () => {
    if (cachedLandingHtml !== null) {
      return cachedLandingHtml;
    }

    try {
      cachedLandingHtml = readFileSync(landingIndexPath, 'utf-8');
    } catch {
      cachedLandingHtml = null;
    }

    return cachedLandingHtml;
  };

  app.use('/*', serveStatic({ root: landingRoot }));

  app.get('*', (c) => {
    const html = getLandingHtml();
    if (!html) {
      return c.json({ ok: false, message: 'Landing not built' }, 404);
    }

    return c.html(html);
  });

  return app;
}

export interface ListenOptions {
  host?: string;

  port?: string | number;
}

export function startServer(app: ReturnType<typeof createServerApp>, options: ListenOptions) {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ? +options.port : 3000;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: host,
      port
    },
    (info) => {
      consola.log(`Start listening on http://${info.address}:${info.port}`);
    }
  );

  return new Promise<void>((res) => {
    server.addListener('close', () => res());
    server.addListener('error', (err) => {
      consola.error(err);
      process.exit(1);
    });
  });
}

export { startCron } from './app';

export type { AppEnv, AppVariables, Context, ServiceBindings } from './app';
