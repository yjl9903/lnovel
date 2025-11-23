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

  try {
    const content = await launchBrowser(c, async (page) => {
      const resp = await page.goto(`https://www.bilinovel.com/novel/${nid}.html`);
      if (!resp) throw new Error('no response');
      if (resp.ok()) {
        return await resp.text();
      } else {
        throw new Error(`${resp.status()} ${resp.statusText()} ${resp.url()}`);
      }
    });

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      html: content
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
    const content = await launchBrowser(c, async (page) => {
      const resp = await page.goto(`https://www.bilinovel.com/novel/${nid}/vol_${vid}.html`);
      if (!resp) throw new Error('no response');
      if (resp.ok()) {
        return await resp.text();
      } else {
        throw new Error(`${resp.status()} ${resp.statusText()} ${resp.url()}`);
      }
    });

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      html: content
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
    const content = await launchBrowser(c, async (page) => {
      const resp = await page.goto(`https://www.bilinovel.com/novel/${nid}/${cid}.html`);
      if (!resp) throw new Error('no response');
      if (resp.ok()) {
        return await resp.text();
      } else {
        throw new Error(`${resp.status()} ${resp.statusText()} ${resp.url()}`);
      }
    });

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      html: content
    });
  } catch (error) {
    return c.json({
      ok: false,
      provider: Provider.bilinovel,
      error: (error as any).message
    });
  }
});
