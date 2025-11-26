import { Hono } from 'hono';

import type { AppEnv, Context } from '../app';

import { fetchNovelPage } from 'bilinovel';

import { Provider } from '../constants';
import { launchBrowser, runBrowserContext } from '../browser';

export const app = new Hono<AppEnv>();

const browser = launchBrowser();

app.get('/', async (c: Context) => {
  return c.json({
    ok: true,
    provider: Provider.bilinovel
  });
});

app.get('/novel/:nid', async (c: Context) => {
  const nid = c.req.param('nid');

  try {
    const data = await runBrowserContext(browser, (context) => fetchNovelPage(context, +nid));

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
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
    return c.json({
      ok: true,
      provider: Provider.bilinovel
    });
  } catch (error) {
    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});

app.get('/novel/:nid/content/:cid', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  try {
    return c.json({
      ok: true,
      provider: Provider.bilinovel
    });
  } catch (error) {
    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});
