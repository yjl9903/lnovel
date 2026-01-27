import { type Context as HonoContext, Hono } from 'hono';
import { type HttpBindings } from '@hono/node-server';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { Cron } from 'croner';
import { createConsola } from 'consola';

import { getOrigin } from './utils/url.js';
import { app as bilinovel, updatePendingNovels } from './bilinovel/index.js';

export const consola = createConsola().withTag('server');

export type ServiceBindings = {};

export type AppVariables = {
  origin: string;
  requestId: string;
  responseTimestamp: Date | undefined | null;
};

export type AppEnv = {
  Bindings: HttpBindings & ServiceBindings;
  Variables: AppVariables;
};

export type Context = HonoContext<AppEnv>;

function createHono() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const origin = getOrigin(c);
    c.set('origin', origin);

    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);

    await next();

    c.res.headers.set('X-Request-Id', requestId);
    c.res.headers.set(
      'X-Response-Timestamp',
      (c.get('responseTimestamp') || new Date()).toISOString()
    );
  });

  app.use(
    '*',
    logger((str, ...rest) => {
      consola.log(str, ...rest);
    })
  );

  app.use('*', prettyJSON({ space: 2 }));

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
    if (err instanceof HTTPException) {
      return err.getResponse();
    } else {
      consola.error('Unhandled error', err);

      return c.json(
        {
          ok: false,
          message: 'Internal Server Error'
        },
        500
      );
    }
  });

  app.get('/health', (c) =>
    c.json({
      ok: true,
      message: 'lnovel.animes.garden'
    })
  );

  return app;
}

export function createApp() {
  const app = createHono();

  app.route('/bili/', bilinovel);

  return app;
}

export async function startCron() {
  const app = createHono();

  app.post('/bili/_/cron', async (c) => {
    try {
      await updatePendingNovels(c);
      return c.json({ ok: true });
    } catch (error) {
      consola.error(error);
      return c.json({ ok: false });
    }
  });

  const biliJob = new Cron('0 * * * *', { timezone: 'Asia/Shanghai', protect: true }, async () => {
    try {
      const APP_HOST = process.env.APP_HOST || 'lnvoel.animes.garden';
      const req = new Request(`https://${APP_HOST}/bili/_/cron`, {
        method: 'POST'
      });
      const res = await app.fetch(req);
      await res.json();
    } catch (error) {
      consola.error(error);
    }
  });

  // 延迟一会后, 手动触发任务执行
  setTimeout(() => {
    biliJob.trigger();
  }, 60 * 1000);
}
