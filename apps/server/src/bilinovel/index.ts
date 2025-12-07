import { Hono } from 'hono';
import { consola } from 'consola';
import { LRUCache } from 'lru-cache';

import { fetchNovelChapters, fetchNovelPage, fetchNovelVolumePage } from 'bilinovel';

import type { AppEnv, Context } from '../app';

import { Provider } from '../constants';
import { getRssString } from '../rss';
import { launchBrowser, runBrowserContextWithCache } from '../browser';

export const app = new Hono<AppEnv>();

const browser = launchBrowser();

const novelCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelPage>> & {}>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000
});

const volCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelVolumePage>> & {}>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000
});

const chapterCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelChapters>> & {}>({
  max: 100,
  ttl: 24 * 60 * 60 * 1000
});

app.use('*', async (c: Context, next) => {
  await next();
  if (c.res.status === 200) {
    c.res.headers.set('Cache-Control', `public, max-age=${24 * 60 * 60}`);
  }
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

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: `Novel ${nid} not found`
        },
        404
      );
    }

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
  }
});

app.get('/novel/:nid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');

  try {
    const data = await runBrowserContextWithCache(browser, novelCache, `${nid}`, (context) =>
      fetchNovelPage(context, +nid)
    );

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: `Novel ${nid} not found`
        },
        404
      );
    }

    const basePath = `/bili/novel/${nid}/feed.xml`;

    const rssString = await getRssString({
      title: data.name,
      description: data.description || data.name,
      site: buildSite(c, basePath),
      items: data.volumes.map((vol) => ({
        title: vol.title || vol.volume,
        description: vol.volume,
        link: `${basePath}/vol/${vol.vid}/feed.xml`,
        categories: data.labels
      }))
    });

    c.res.headers.set('Content-Type', 'application/xml; charset=UTF-8');

    return c.body(rssString);
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
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

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: 'Volume not found'
        },
        404
      );
    }

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
  }
});

app.get('/novel/:nid/vol/:vid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');
  const vid = c.req.param('vid');

  try {
    const data = await runBrowserContextWithCache(
      browser,
      volCache,
      `${nid}/vol_${vid}`,
      (context) => fetchNovelVolumePage(context, +nid, +vid)
    );

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: 'Volume not found'
        },
        404
      );
    }

    const basePath = `/bili/novel/${nid}/vol/${vid}/feed.xml`;

    const rssString = await getRssString({
      title: `${data.name}`,
      description: data.description,
      site: buildSite(c, basePath),
      items: data.chapters.map((chapter) => ({
        title: chapter.title,
        description: chapter.title,
        link: `/bili/novel/${nid}/chapter/${chapter.cid}/feed.xml`,
        categories: data.labels
      }))
    });

    c.res.headers.set('Content-Type', 'application/xml; charset=UTF-8');

    return c.body(rssString);
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
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
      (context) => fetchNovelChapters(context, +nid, +cid, { transformRuby: true })
    );

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: 'Chapter not found'
        },
        404
      );
    }

    return c.json({
      ok: true,
      provider: Provider.bilinovel,
      data
    });
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
  }
});

app.get('/novel/:nid/chapter/:cid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  try {
    const data = await runBrowserContextWithCache(
      browser,
      chapterCache,
      `${nid}/${cid}`,
      (context) => fetchNovelChapters(context, +nid, +cid, { transformRuby: true })
    );

    if (!data) {
      return c.json(
        {
          ok: false,
          provider: Provider.bilinovel,
          error: 'Chapter not found'
        },
        404
      );
    }

    const basePath = `/bili/novel/${nid}/chapter/${cid}/feed.xml`;
    const title = data.title || `Chapter ${cid}`;

    const rssString = await getRssString({
      title,
      description: title,
      site: buildSite(c, basePath),
      items: [
        {
          title,
          link: basePath,
          content: data.content
        }
      ]
    });

    c.res.headers.set('Content-Type', 'application/xml; charset=UTF-8');

    return c.body(rssString);
  } catch (error) {
    consola.withTag(Provider.bilinovel).error(error);

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        error: (error as any).message
      },
      500
    );
  }
});

function buildSite(c: Context, path: string) {
  const requestUrl = new URL(c.req.url);

  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();

  const proto = forwardedProto || requestUrl.protocol.replace(/:$/, '');
  const host = forwardedHost || requestUrl.host;

  const origin = `${proto}://${host}`;

  return new URL(path, origin).toString();
}
