import { type Context as HonoContext, Hono } from 'hono';
import { type HttpBindings } from '@hono/node-server';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { Cron } from 'croner';

import { getOrigin } from './utils/url.js';
import { app as bilinovel, updatePendingNovels } from './bilinovel/index.js';
import { createLogger, requestLogging, runTask, addShutdownHook } from './logging';

export const logger = createLogger('server');

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

  app.use('*', requestLogging('api'));

  app.use('*', async (c, next) => {
    const origin = getOrigin(c);
    c.set('origin', origin);

    const requestId = c.get('requestId');

    try {
      await next();
    } finally {
      c.res.headers.set('X-Request-Id', requestId);
      c.res.headers.set(
        'X-Response-Timestamp',
        (c.get('responseTimestamp') || new Date()).toISOString()
      );

      const contentType = c.res.headers.get('content-type');
      if (contentType && contentType.toLowerCase().startsWith('application/json')) {
        c.res.headers.set('Content-Type', 'application/json; charset=utf-8');
      }
    }
  });

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
      logger.error('Unhandled error', { event: 'api.failed' }, err);

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
      logger.error('Cron failed', { event: 'cron.failed' }, error);
      return c.json({ ok: false });
    }
  });

  const biliJob = new Cron('0 * * * *', { timezone: 'Asia/Shanghai', protect: true }, () =>
    runTask('cron.update-pending', {}, async () => {
      try {
        const APP_HOST = process.env.APP_HOST || 'lnovel.animes.garden';
        const req = new Request(`https://${APP_HOST}/bili/_/cron`, {
          method: 'POST'
        });
        const res = await app.fetch(req);
        const result = (await res.json()) as { ok?: boolean };
        if (!result.ok) throw new Error('Pending novel update failed');
      } catch (error) {
        logger.error('Cron failed', { event: 'cron.failed' }, error);
        throw error;
      }
    }).catch(() => {})
  );

  // 延迟一会后, 手动触发任务执行
  const timer = setTimeout(() => {
    biliJob.trigger();
  }, 60 * 1000);
  addShutdownHook(() => {
    clearTimeout(timer);
    biliJob.stop();
  });
}
