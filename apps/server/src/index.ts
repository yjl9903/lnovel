import { readFileSync } from 'node:fs';
import path from 'node:path';

import { serveStatic } from '@hono/node-server/serve-static';

import { createApp as createServerApp } from './app';

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

export function createApp() {
  const app = createServerApp();

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

export { startCron } from './app';

export type { AppEnv, AppVariables, Context, ServiceBindings } from './app';
