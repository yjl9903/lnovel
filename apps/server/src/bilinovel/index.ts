import { Hono } from 'hono';
import { consola } from 'consola';

import type { AppEnv, Context } from '../app';

import { fetchNovelChapters, fetchNovelPage, fetchNovelVolumePage } from 'bilinovel';

import { Provider } from '../constants';
import { launchBrowser, runBrowserContext, runBrowserContextWithCache } from '../browser';
import { LRUCache } from 'lru-cache';

export const app = new Hono<AppEnv>();

const browser = launchBrowser();

const novelCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelPage>> & {}>({
  max: 1000
});

const volCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelVolumePage>> & {}>({
  max: 1000
});

const chapterCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelChapters>> & {}>({
  max: 100
});

app.use('*', async (c: Context, next) => {
  c.res.headers.set('Cache-Control', `public, max-age=${24 * 60 * 60}`);
  await next();
});

app.get('/', async (c: Context) => {
  return c.json({
    ok: true,
    provider: Provider.bilinovel
  });
});

app.get('/novel/:nid', async (c: Context) => {
  const nid = c.req.param('nid');

  try {
    const data = await runBrowserContextWithCache(browser, novelCache, `${nid}`, (context) =>
      fetchNovelPage(context, +nid)
    );

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});

app.get('/novel/:nid/vol/:vid', async (c: Context) => {
  const nid = c.req.param('nid');
  const vid = c.req.param('vid');

  try {
    const data = await runBrowserContextWithCache(
      browser,
      volCache,
      `${nid}/vol_${vid}`,
      (context) => fetchNovelVolumePage(context, +nid, +vid)
    );

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});

app.get('/novel/:nid/chapter/:cid', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  try {
    const data = await runBrowserContextWithCache(
      browser,
      chapterCache,
      `${nid}/${cid}`,
      (context) => fetchNovelChapters(context, +nid, +cid),
      {
        javaScriptEnabled: false
      }
    );

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});
