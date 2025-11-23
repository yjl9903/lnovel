import { Hono } from 'hono';
import { logger } from 'hono/logger';

import type { AppEnv } from './env';

import { app as bilinovel } from './bilinovel';

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
  console.error('Unhandled error', err);

  return c.json(
    {
      ok: false,
      message: 'Internal Server Error'
    },
    500
  );
});

app.get('/', (c) =>
  c.json({
    ok: true,
    message: 'lnovel.animes.garden'
  })
);

app.route('/bili/', bilinovel);

export default app;
