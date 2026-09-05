import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { serveStatic } from '@hono/node-server/serve-static';
import { serverApp } from './server/api.server';
import { createGateway } from './server/gateway';

const gateway = createGateway({
  apiFetch: (request) => serverApp.fetch(request),
  startFetch: (request) => handler.fetch(request),
  assets: process.env.WEB_ASSET_ROOT ? serveStatic({ root: process.env.WEB_ASSET_ROOT }) : undefined
});

export default createServerEntry({
  fetch: (request) => gateway.fetch(request)
});
