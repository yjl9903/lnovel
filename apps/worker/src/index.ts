import { Hono } from 'hono';
import { logger } from 'hono/logger';

import type { AppEnv } from './env';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  await next();

  c.res.headers.set('X-Request-Id', requestId);
});

app.use('*', logger());

app.notFound((c) => {
  return c.json(
    {
      ok: false,
      message: 'Not Found'
    },
    404
  );
});

app.onError((err, c) => {
  const requestId = c.get('requestId');

  console.error('[bgmw] unhandled error', err, { requestId });

  return c.json(
    {
      ok: false,
      message: 'Internal Server Error'
    },
    500
  );
});
