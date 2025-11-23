import { Hono } from 'hono';

import type { AppEnv, Context } from '../env';

import { Provider } from '../constants';
import { launchBrowser } from '../browser';

export const app = new Hono<AppEnv>();

app.get('/', async (c: Context) => {
  return c.json({
    ok: true,
    provider: Provider.bilinovel
  });
});

app.get('/novel/:nid', async (c: Context) => {
  const nid = c.req.param('nid');

  const content = await launchBrowser(c, async (page) => {
    await page.goto(`https://www.bilinovel.com/novel/${nid}.html`);
    return await page.content();
  });

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    html: content
  });
});

app.get('/novel/:nid/vol/:vid', async (c: Context) => {
  const nid = c.req.param('nid');
  const vid = c.req.param('vid');

  const content = await launchBrowser(c, async (page) => {
    await page.goto(`https://www.bilinovel.com/novel/${nid}/vol_${vid}.html`);
    return await page.content();
  });

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    html: content
  });
});

app.get('/novel/:nid/content/:cid', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  const content = await launchBrowser(c, async (page) => {
    await page.goto(`https://www.bilinovel.com/novel/${nid}/${cid}.html`);
    return await page.content();
  });

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    html: content
  });
});
