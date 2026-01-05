import { type Context as HonoContext, Hono } from 'hono';
import { type HttpBindings } from '@hono/node-server';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { createConsola } from 'consola';

import { app as bilinovel } from './bilinovel';
import { HTTPException } from 'hono/http-exception';

const consola = createConsola().withTag('server');

export type ServiceBindings = {};

export type AppVariables = {
  requestId: string;
  responseTimestamp: Date | undefined | null;
};

export type AppEnv = {
  Bindings: HttpBindings & ServiceBindings;
  Variables: AppVariables;
};

export type Context = HonoContext<AppEnv>;

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
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

  app.get('/', (c) =>
    c.json({
      ok: true,
      message: 'lnovel.animes.garden'
    })
  );

  app.get('/health', (c) =>
    c.json({
      ok: true,
      message: 'lnovel.animes.garden'
    })
  );

  app.route('/bili/', bilinovel);

  app.get('/html/', async (c) => {
    // const searchParams = new URL(c.req.url).searchParams;
    // const url = new URL(searchParams.get('url')!).toString();
    // const html = await launchBrowser(c, async (page) => {
    //   const resp = await page.goto(url);
    //   console.log('[browser]', resp!.request().headers(), page.viewport(), await page.cookies());
    //   return await page.content();
    // });
    // return c.json({
    //   ok: true,
    //   html
    // });
  });

  return app;
}
