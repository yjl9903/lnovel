import { Hono } from 'hono';

import type { AppEnv, Context } from '../app';

import { Provider } from '../constants';
import { getFeedResponse, getOpmlResponse } from '../rss';

import { FOLLOW_FEED_ID, FOLLOW_USER_ID } from './constants';
import { consola, buildSite, normalizeDescription } from './utils';
import {
  getNovel,
  getNovelVolume,
  getNovelChapter,
  getNovelByDatabase,
  getNovelVolumeByDatabase,
  getNovelChapterByDatabase
} from './handlers';

export const app = new Hono<AppEnv>();

app.use('*', async (c: Context, next) => {
  await next();
  if (c.res.status === 200 && !c.res.headers.get('Cache-Control')) {
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

  const db = await getNovelByDatabase(nid);
  if (db) {
    getNovel(c, nid);
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
    getNovel(c, nid);
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
    getNovel(c, nid);
    return c.json({ ok: true, provider: Provider.bilinovel, data: db });
  }

  const resp = await getNovelChapter(c, nid, cid);

  getNovel(c, nid);

  return resp.ok
    ? c.json({ ok: true, provider: Provider.bilinovel, data: resp.data })
    : c.json({ ok: false, provider: Provider.bilinovel, message: resp.message }, resp.status);
});

app.get('/novel/:nid/feed.xml', async (c: Context) => {
  const nid = c.req.param('nid');

  const db = await getNovelByDatabase(nid);

  const resp = db ? ({ ok: true, data: db } as const) : await getNovel(c, nid);

  if (resp.ok) {
    const { data } = resp;

    getNovel(c, nid);

    return getFeedResponse(c, {
      title: data.name,
      description: normalizeDescription(data.description || data.name),
      link: buildSite(c, `/bili/novel/${nid}`),
      rssLink: buildSite(c, `/bili/novel/${nid}/feed.xml`),
      image: data.cover,
      items: data.volumes.map((vol) => ({
        title: vol.title || vol.volume,
        id: `/bili/novel/${nid}/vol/${vol.vid}`,
        link: buildSite(c, `/bili/novel/${nid}/vol/${vol.vid}`),
        image: vol.cover,
        date: data.updatedAt,
        categories: data.labels
      }))
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

    getNovel(c, nid);

    return getFeedResponse(c, {
      title: `${data.name}`,
      description: normalizeDescription(data.description),
      link: buildSite(c, `/bili/novel/${nid}/vol/${vid}`),
      rssLink: buildSite(c, `/bili/novel/${nid}/vol/${vid}/feed.xml`),
      image: data.cover,
      items: chapters.map((chapter, index) => ({
        title: `${data.name} ${chapter.title}`,
        id: `/bili/novel/${nid}/chapter/${chapter.cid}`,
        link: buildSite(c, `/bili/novel/${nid}/chapter/${chapter.cid}`),
        // @hack 强制 feed item 的时间顺序, 防止阅读器重排序
        date: new Date(data.updatedAt.getTime() + 1000 * index),
        categories: data.labels,
        content: chapter.content
      })),
      follow: {
        feedId: FOLLOW_FEED_ID.get(`/bili/novel/${nid}/vol/${vid}`),
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

    getNovel(c, nid);

    return getFeedResponse(c, {
      title,
      description: normalizeDescription(title),
      link: buildSite(c, `/bili/novel/${nid}/chapter/${cid}`),
      rssLink: buildSite(c, `/bili/novel/${nid}/chapter/${cid}/feed.xml`),
      items: [
        {
          title,
          id: `/bili/novel/${nid}/chapter/${cid}`,
          link: buildSite(c, `/bili/novel/${nid}/chapter/${cid}`),
          date: new Date(novel.data.updatedAt),
          content: data.content
        }
      ]
    });
  } else {
    return c.text(`${resp.message}`, resp.status);
  }
});

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
