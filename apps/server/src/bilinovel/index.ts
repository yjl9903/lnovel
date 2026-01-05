import { Hono } from 'hono';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import { etag, RETAINED_304_HEADERS } from 'hono/etag';
import {
  formatTopFilterTitle,
  formatWenkuFilterTitle,
  parseTopFilter,
  parseWenkuFilter
} from 'bilinovel';

import type { AppEnv, Context } from '../app';

import { Provider } from '../constants';
import { buildSite, getFeedURL } from '../utils';
import { getFeedResponse, getOpmlResponse } from '../rss';
import { FOLLOW_USER_ID, getFoloFeedId, getFoloShareURL, setFoloFeedId } from '../folo';

import { consola, normalizeDescription } from './utils';
import {
  getNovel,
  getNovelVolume,
  getNovelChapter,
  getNovelByDatabase,
  getNovelVolumeByDatabase,
  getNovelChapterByDatabase,
  getWenku,
  getTop
} from './handlers';

export const app = new Hono<AppEnv>();

app.use(
  '*',
  timeout(30 * 1000, (c: Context) => {
    const url = new URL(c.req.url);

    if (url.pathname.endsWith('/feed.xml')) {
      return new HTTPException(500, {
        res: new Response(
          `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lnovel</title>
</head>
<body>
  <p>Request timeout after waiting 30 seconds. Please try <a href="${getFeedURL(c)}">RSS link</a> again later.</p>
</body>
</html>`,
          {
            headers: {
              'Content-Type': 'text/html'
            }
          }
        )
      });
    }

    return new HTTPException(500, {
      message: `Request timeout after waiting 30 seconds. Please try again later.`
    });
  })
);

app.use('*', async (c: Context, next) => {
  await next();
  if (c.res.status === 200 && !c.res.headers.get('Cache-Control')) {
    c.res.headers.set('Cache-Control', `public, max-age=${24 * 60 * 60}`);
  }
});

app.use(
  '*',
  etag({
    retainedHeaders: ['X-Request-Id', 'X-Response-Timestamp', ...RETAINED_304_HEADERS]
  })
);

app.get('/', async (c: Context) => {
  return c.json({
    ok: true,
    provider: Provider.bilinovel
  });
});

app.get('/wenku', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseWenkuFilter(url.searchParams);
  const resp = await getWenku(c, filter);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, filter, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/top/:sort', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseTopFilter(url);
  const resp = await getTop(c, filter);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, filter, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/novel/:nid', async (c: Context) => {
  const nid = c.req.param('nid');

  const db = await getNovelByDatabase(nid);
  if (db) {
    updateNovelAndFeedId(c, nid);
    return c.json({ ok: true, provider: Provider.bilinovel, data: db });
  }

  const resp = await getNovel(c, nid);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/novel/:nid/vol/:vid', async (c: Context) => {
  const nid = c.req.param('nid');
  const vid = c.req.param('vid');

  const db = await getNovelVolumeByDatabase(nid, vid);
  if (db) {
    updateNovelAndFeedId(c, nid);
    return c.json({ ok: true, provider: Provider.bilinovel, data: db });
  }

  const resp = await getNovelVolume(c, nid, vid);

  getNovel(c, nid);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/novel/:nid/chapter/:cid', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  const db = await getNovelChapterByDatabase(nid, cid);
  if (db) {
    updateNovelAndFeedId(c, nid);
    return c.json({ ok: true, provider: Provider.bilinovel, data: db });
  }

  const resp = await getNovelChapter(c, nid, cid);

  getNovel(c, nid);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/wenku/feed.xml', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseWenkuFilter(url.searchParams);
  const resp = await getWenku(c, filter);

  if (resp.ok) {
    const { data } = resp;

    const items = await Promise.all(
      data.items.map(async (rawItem) => {
        const rawFeedURL = buildSite(c, `/bili/novel/${rawItem.nid}/feed.xml`);
        const foloId = await getFoloFeedId(rawFeedURL);
        const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
        const feedUrl = rawFeedURL;

        const dbItem = await getNovelByDatabase('' + rawItem.nid);

        return {
          title: dbItem?.name || rawItem.title,
          id: `/bili/novel/${rawItem.nid}`,
          link: `https://www.linovelib.com/novel/${rawItem.nid}.html`,
          content: `<p><a href=\"${`https://www.linovelib.com/novel/${rawItem.nid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>
<p>${dbItem?.description || rawItem.description}</p>
<p><img src="${dbItem?.cover || rawItem.cover}" alt="cover" /></p>`,
          image: dbItem?.cover || rawItem.cover,
          date: dbItem?.updatedAt || rawItem.updatedAt,
          categories: rawItem.tags
        };
      })
    );

    setFoloFeedId(getFeedURL(c));

    return getFeedResponse(c, {
      title: formatWenkuFilterTitle(filter),
      description:
        '轻小说文库，哔哩轻小说，是收录最全更新最快的动漫 sf 轻小说网站，提供轻小说在线阅读，TXT 与电子书下载。',
      link: data.url,
      rssLink: buildSite(c, `/wenku/feed.xml${url.search}`),
      image: 'https://www.bilinovel.com/logo.png',
      items,
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: FOLLOW_USER_ID
      }
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

app.get('/top/:sort/feed.xml', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseTopFilter(url);
  const resp = await getTop(c, filter);

  if (resp.ok) {
    const { data } = resp;

    const items = await Promise.all(
      data.items.map(async (rawItem) => {
        const rawFeedURL = buildSite(c, `/bili/novel/${rawItem.nid}/feed.xml`);
        const foloId = await getFoloFeedId(rawFeedURL);
        const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
        const feedUrl = rawFeedURL;

        const dbItem = await getNovelByDatabase('' + rawItem.nid);

        return {
          title: dbItem?.name || rawItem.title,
          id: `/bili/novel/${rawItem.nid}`,
          link: `https://www.linovelib.com/novel/${rawItem.nid}.html`,
          content: `<p><a href=\"${`https://www.linovelib.com/novel/${rawItem.nid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>
<p>${dbItem?.description || rawItem.description}</p>
<p><img src="${dbItem?.cover || rawItem.cover}" alt="cover" /></p>`,
          image: dbItem?.cover || rawItem.cover,
          date: dbItem?.updatedAt || rawItem.updatedAt
        };
      })
    );

    setFoloFeedId(getFeedURL(c));

    return getFeedResponse(c, {
      title: formatTopFilterTitle(filter),
      description:
        '轻小说文库，哔哩轻小说，是收录最全更新最快的动漫 sf 轻小说网站，提供轻小说在线阅读，TXT 与电子书下载。',
      link: data.url,
      rssLink: buildSite(c, `/top/${filter.sort}/feed.xml${url.search}`),
      image: 'https://www.bilinovel.com/logo.png',
      items,
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: FOLLOW_USER_ID
      }
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

app.get('/novel/:nid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');

  const db = await getNovelByDatabase(nid);

  const resp = db ? ({ ok: true, data: db } as const) : await getNovel(c, nid);

  if (resp.ok) {
    const { data } = resp;

    updateNovelAndFeedId(c, nid);

    const items = await Promise.all(
      data.volumes.map(async (vol, index) => {
        const rawFeedURL = buildSite(c, `/bili/novel/${nid}/vol/${vol.vid}/feed.xml`);
        const foloId = await getFoloFeedId(rawFeedURL);
        const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
        const feedUrl = rawFeedURL;

        return {
          title: vol.title || vol.volume,
          id: `/bili/novel/${nid}/vol/${vol.vid}`,
          link: `https://www.linovelib.com/novel/${nid}/vol_${vol.vid}.html`,
          content: `<p><a href=\"${`https://www.linovelib.com/novel/${nid}/vol_${vol.vid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p><p><img src="${vol.cover}" alt="cover" /></p>`,
          image: vol.cover,
          // @hack 强制 feed item 的时间顺序, 防止阅读器重排序
          date: new Date(data.updatedAt.getTime() + 1000 * index),
          categories: data.labels
        };
      })
    );

    return getFeedResponse(c, {
      title: data.name,
      description: normalizeDescription(data.description || data.name),
      link: `https://www.linovelib.com/novel/${nid}.html`,
      rssLink: buildSite(c, `/bili/novel/${nid}/feed.xml`),
      image: data.cover,
      items,
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: FOLLOW_USER_ID
      }
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

app.get('/novel/:nid/feed.opml', async (c: Context) => {
  const nid = c.req.param('nid');

  const novel = await getNovel(c, nid);

  if (novel.ok) {
    const { data } = novel;

    const resps = await Promise.all(
      data.volumes.map(async (vol) => getNovelVolume(c, nid, '' + vol.vid))
    );

    const error = resps.find((vol) => !vol.ok);
    if (error) {
      return c.text(`${error.message}`, error.status);
    }

    const volumes = resps.filter((r) => r.data).map((r) => r.data!);

    return getOpmlResponse(c, {
      title: data.name,
      description: normalizeDescription(data.description || data.name),
      items: volumes.flatMap((vol) =>
        vol.chapters.map((chapter) => ({
          title: `${vol.name} ${chapter.title}`,
          xmlUrl: buildSite(c, `/bili/novel/${nid}/chapter/${chapter.cid}/feed.xml`)
        }))
      )
    });
  } else {
    return c.text(`${novel.message}`, novel.status);
  }
});

app.get('/novel/:nid/vol/:vid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');
  const vid = c.req.param('vid');

  const db = await getNovelVolumeByDatabase(nid, vid);

  const resp = db ? ({ ok: true, data: db } as const) : await getNovelVolume(c, nid, vid);

  if (resp.ok) {
    const { data } = resp;

    const chapters = [];
    for (const chapter of data.chapters) {
      const db = await getNovelChapterByDatabase(nid, '' + chapter.cid);
      const resp = db
        ? ({ ok: true, data: db } as const)
        : await getNovelChapter(c, nid, '' + chapter.cid);

      if (resp.ok) {
        chapters.push(resp.data!);
      } else {
        return c.text(`${resp.message}`, resp.status);
      }
    }

    updateNovelAndFeedId(c, nid);

    return getFeedResponse(c, {
      title: `${data.name}`,
      description: normalizeDescription(data.description),
      link: `https://www.linovelib.com/novel/${nid}/vol_${vid}.html`,
      rssLink: buildSite(c, `/bili/novel/${nid}/vol/${vid}/feed.xml`),
      image: data.cover,
      items: chapters.map((chapter, index) => ({
        title: `${data.name} ${chapter.title}`,
        id: `/bili/novel/${nid}/chapter/${chapter.cid}`,
        link: `https://www.linovelib.com/novel/${nid}/${chapter.cid}.html`,
        // @hack 强制 feed item 的时间顺序, 防止阅读器重排序
        date: new Date(data.updatedAt.getTime() + 1000 * index),
        categories: data.labels,
        content: chapter.content
      })),
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: FOLLOW_USER_ID
      }
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

app.get('/novel/:nid/chapter/:cid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');
  const cid = c.req.param('cid');

  const [resp, novel] = await Promise.all([getNovelChapter(c, nid, cid), getNovel(c, nid)]);

  if (resp.ok && novel.ok) {
    const { data } = resp;
    const title = data.title || `Chapter ${cid}`;

    updateNovelAndFeedId(c, nid);

    return getFeedResponse(c, {
      title,
      description: normalizeDescription(title),
      link: `https://www.linovelib.com/novel/${nid}/${cid}.html`,
      rssLink: buildSite(c, `/bili/novel/${nid}/chapter/${cid}/feed.xml`),
      items: [
        {
          title,
          id: `/bili/novel/${nid}/chapter/${cid}`,
          link: `https://www.linovelib.com/novel/${nid}/${cid}.html`,
          date: new Date(novel.data.updatedAt),
          content: data.content
        }
      ],
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: FOLLOW_USER_ID
      }
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

async function updateNovelAndFeedId(c: Context, nid: string) {
  return new Promise<void>((res) => {
    setTimeout(async () => {
      try {
        const url = new URL(getFeedURL(c));
        await Promise.all([
          getNovel(c, nid),
          url.pathname.endsWith('/feed.xml') ? setFoloFeedId(getFeedURL(c)) : undefined
        ]);
      } catch (error) {
        consola.error('Update novel', error);
      } finally {
        res();
      }
    }, 1000);
  });
}

app.get('/files/*', async (c: Context) => {
  const pathname = new URL(c.req.url).pathname.replace(/^\/bili/, '');
  const target = new URL(pathname, `https://www.linovelib.com`);

  c.res.headers.set('X-Forward-Img', target.toString());

  consola.log('Fetch', c.req.url, '->', target.toString());

  const resp = await fetch(target, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: 'https://www.linovelib.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  });

  if (resp.ok) {
    const data = await resp.arrayBuffer();

    c.res.headers.set('Content-Type', resp.headers.get('Content-Type') || 'image/jpeg');
    c.res.headers.set('Cache-Control', resp.headers.get('Cache-Control') || 'max-age=2678400');

    return c.body(data);
  }

  return c.body(null, 404);
});

app.get('/img3/*', async (c: Context) => {
  const pathname = new URL(c.req.url).pathname.replace(/^\/bili\/img3/, '');
  const target = new URL(pathname, `https://img3.readpai.com`);

  c.res.headers.set('X-Forward-Img', target.toString());

  consola.log('Fetch', c.req.url, '->', target.toString());

  const resp = await fetch(target, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: 'https://www.linovelib.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  });

  if (resp.ok) {
    const data = await resp.arrayBuffer();

    c.res.headers.set('Content-Type', resp.headers.get('Content-Type') || 'image/jpeg');
    c.res.headers.set('Cache-Control', resp.headers.get('Cache-Control') || 'max-age=2678400');

    return c.body(data);
  }

  return c.body(null, 404);
});
