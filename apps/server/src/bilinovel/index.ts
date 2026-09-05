import { Hono } from 'hono';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import { etag, RETAINED_304_HEADERS } from 'hono/etag';

import {
  parseTopFilter,
  parseWenkuFilter,
  formatTopFilterTitle,
  formatWenkuFilterTitle
} from 'bilinovel';

import type { AppEnv, Context } from '../app';

import { runTask, scheduleTask, safeUrl } from '../logging';
import { Provider } from '../constants';
import { getFeedResponse } from '../rss';
import { buildSite, getFeedURL } from '../utils';
import { getFoloUserId, getFoloFeedId, getFoloShareURL, setFoloFeedId } from '../folo';

import { logger, normalizeDescription, transformAuthor } from './utils';
import {
  engine,
  getTop,
  getWenku,
  getGlobal,
  getNovel,
  getNovelVolume,
  updateNovel,
  WorkflowException,
  updateNovelVolume,
  updateNovelChapter
} from './workflow';
import {
  getNovelFromDatabase,
  getNovelsFromDatabase,
  getNovelVolumeFromDatabase,
  getNovelChapterFromDatabase
} from './database';

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
  <p>Request timeout after waiting 30 seconds.</p>
  <p>Please try <a href="${getFeedURL(c)}">RSS link</a> again later.</p>
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

    return new HTTPException(408, {
      message: `Request timeout after waiting 30 seconds. Please try again later.`
    });
  })
);

app.use('*', async (c: Context, next) => {
  await next();

  // 更新 folo feed id
  const feedURL = new URL(getFeedURL(c));
  if (feedURL.pathname.endsWith('/feed.xml')) {
    scheduleTask(
      'folo.update',
      {},
      async () => {
        await setFoloFeedId(feedURL);
      },
      1000
    );
  }

  const enableCache = !feedURL.pathname.endsWith('/contexts');
  if (enableCache) {
    // 设置缓存 header
    if (c.res.status === 200 && !c.res.headers.get('Cache-Control')) {
      c.res.headers.set('Cache-Control', `public, max-age=${24 * 60 * 60}`);
    }
  } else {
    // 禁止缓存
    c.res.headers.set('Cache-Control', 'no-store, no-cache, max-age=0');
  }
});

app.use(
  '*',
  etag({
    retainedHeaders: ['X-Request-Id', 'X-Response-Timestamp', ...RETAINED_304_HEADERS]
  })
);

app.onError(async (error: unknown, c: Context) => {
  const url = new URL(c.req.url);
  const status =
    error instanceof WorkflowException
      ? error.status
      : error instanceof HTTPException
        ? error.status
        : 500;

  if (status >= 500) {
    logger.error(
      'Request failed',
      {
        event: 'request.failed',
        ...{
          request_id: c.get('requestId'),
          method: c.req.method,
          url: safeUrl(url),
          status
        }
      },
      error
    );
  }

  if (error instanceof HTTPException) {
    return error.getResponse();
  } else if (url.pathname.endsWith('/feed.xml')) {
    const message =
      error instanceof WorkflowException
        ? error.getMessage()
        : (error as Error)?.message || 'unknown';

    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lnovel</title>
</head>
<body>
  <p>Request Error: ${message}</p>
  <p>Please try <a href="${getFeedURL(c)}">RSS link</a> again later.</p>
</body>
</html>`,
      error instanceof WorkflowException ? error.status : 500
    );
  } else {
    const message =
      error instanceof WorkflowException
        ? error.getMessage()
        : (error as Error)?.message || 'unknown';

    return c.json(
      {
        ok: false,
        provider: Provider.bilinovel,
        message
      },
      error instanceof WorkflowException ? error.status : 500
    );
  }
});

app.get('/', async (c: Context) => {
  return c.json({
    ok: true,
    provider: Provider.bilinovel
  });
});

app.get('/contexts', async (c: Context) => {
  const stores = engine.getStores();
  const contexts = stores.map((store) => [...store.contexts.values()]).flat();
  const data = contexts.map((ctx) => ({
    scope: ctx.workflow.scope,
    key: ctx.key,
    status: ctx.status,
    variables: ctx.variables
  }));

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    data: {
      contexts: data
    }
  });
});

app.get('/wenku', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseWenkuFilter(url.searchParams);
  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: getWenku.scope,
    workflow_key: getWenku.key(filter),
    filter
  });
  const data = await engine.run(getGlobal(c), getWenku, filter);

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    filter,
    data: {
      ...data,
      items: await attachFoloFeedIds(c, data.items)
    }
  });
});

app.get('/top/:sort', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseTopFilter(url);
  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: getTop.scope,
    workflow_key: getTop.key(filter),
    filter
  });
  const data = await engine.run(getGlobal(c), getTop, filter);

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    filter,
    data: {
      ...data,
      items: await attachFoloFeedIds(c, data.items)
    }
  });
});

app.get('/novels', async (c: Context) => {
  const novels = await getNovelsFromDatabase();
  const data = await attachFoloFeedIds(c, novels);
  return c.json({ ok: true, provider: Provider.bilinovel, data });
});

app.get('/novel/:nid', validateNumericParams('nid'), async (c: Context) => {
  const url = new URL(c.req.url);
  const force = !!url.searchParams.get('force');

  const nid = c.req.param('nid')!;

  const db = await getNovelFromDatabase(nid, false);
  if (!db || force) {
    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: getNovel.scope,
      workflow_key: getNovel.key(+nid),
      novel_id: +nid
    });
  }
  const data = db && !force ? db : await engine.run(getGlobal(c), getNovel, +nid);

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovel.scope,
    workflow_key: updateNovel.key(+nid),
    novel_id: +nid,
    background: true
  });
  runTask(
    'workflow.background',
    { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
    () => engine.run(getGlobal(c), updateNovel, +nid)
  ).catch(() => {});

  return c.json({ ok: true, provider: Provider.bilinovel, data: await attachFoloFeedId(c, data) });
});

app.get('/novel/:nid/vol/:vid', validateNumericParams('nid', 'vid'), async (c: Context) => {
  const url = new URL(c.req.url);
  const force = !!url.searchParams.get('force');

  const nid = c.req.param('nid')!;
  const vid = c.req.param('vid')!;

  const db = await getNovelVolumeFromDatabase(nid, vid, false);

  if (db && !force) {
    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: updateNovel.scope,
      workflow_key: updateNovel.key(+nid),
      novel_id: +nid,
      background: true
    });
    runTask(
      'workflow.background',
      { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
      () => engine.run(getGlobal(c), updateNovel, +nid)
    ).catch(() => {});
    const data = await attachFoloVolumeFeedId(c, db);
    return c.json({ ok: true, provider: Provider.bilinovel, data });
  }

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovelVolume.scope,
    workflow_key: updateNovelVolume.key(+nid, +vid),
    novel_id: +nid,
    volume_id: +vid
  });
  const data = await engine.run(getGlobal(c), updateNovelVolume, +nid, +vid);

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovel.scope,
    workflow_key: updateNovel.key(+nid),
    novel_id: +nid,
    background: true
  });
  runTask(
    'workflow.background',
    { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
    () => engine.run(getGlobal(c), updateNovel, +nid)
  ).catch(() => {});

  return c.json({
    ok: true,
    provider: Provider.bilinovel,
    data: await attachFoloVolumeFeedId(c, data)
  });
});

app.get('/novel/:nid/chapter/:cid', validateNumericParams('nid', 'cid'), async (c: Context) => {
  const url = new URL(c.req.url);
  const force = !!url.searchParams.get('force');

  const nid = c.req.param('nid')!;
  const cid = c.req.param('cid')!;

  const db = await getNovelChapterFromDatabase(nid, cid);
  if (db && !force) {
    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: updateNovel.scope,
      workflow_key: updateNovel.key(+nid),
      novel_id: +nid,
      background: true
    });
    runTask(
      'workflow.background',
      { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
      () => engine.run(getGlobal(c), updateNovel, +nid)
    ).catch(() => {});
    return c.json({ ok: true, provider: Provider.bilinovel, data: db });
  }

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovelChapter.scope,
    workflow_key: updateNovelChapter.key(+nid, +cid),
    novel_id: +nid,
    chapter_id: +cid
  });
  const data = await engine.run(getGlobal(c), updateNovelChapter, +nid, +cid);

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovel.scope,
    workflow_key: updateNovel.key(+nid),
    novel_id: +nid,
    background: true
  });
  runTask(
    'workflow.background',
    { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
    () => engine.run(getGlobal(c), updateNovel, +nid)
  ).catch(() => {});

  return c.json({ ok: true, provider: Provider.bilinovel, data });
});

app.get('/novels/feed.xml', async (c: Context) => {
  try {
    const novels = await getNovelsFromDatabase();

    const items = await Promise.all(
      novels.map(async (dbItem) => {
        const rawFeedURL = buildSite(c, `/bili/novel/${dbItem.nid}/feed.xml`);
        const foloId = await getFoloFeedId(rawFeedURL);
        const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
        const feedUrl = rawFeedURL;

        return {
          title: dbItem.name,
          id: `/bili/novel/${dbItem.nid}`,
          link: `https://www.linovelib.com/novel/${dbItem.nid}.html`,
          author: dbItem.authors.map((author) => transformAuthor(author)),
          content: `<p><a href=\"${`https://www.linovelib.com/novel/${dbItem.nid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>
<p>${dbItem.description}</p>
<p><img src="${dbItem.cover}" alt="cover" /></p>`,
          image: dbItem.cover,
          date: dbItem.updatedAt,
          categories: dbItem.labels
        };
      })
    );

    return getFeedResponse(c, {
      title: 'lnovel 哔哩轻小说 索引',
      description: '轻小说镜像聚合站 lnovel',
      link: buildSite(c, `/novels`),
      rssLink: buildSite(c, `/novels/feed.xml`),
      image: 'https://www.bilinovel.com/logo.png',
      items,
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: getFoloUserId()
      }
    });
  } catch (error) {
    logger.error('Failed rendering novels feed', { event: 'feed.render.failed' }, error);
    return c.text(`Internal Error`, 500);
  }
});

app.get('/wenku/feed.xml', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseWenkuFilter(url.searchParams);
  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: getWenku.scope,
    workflow_key: getWenku.key(filter),
    filter
  });
  const data = await engine.run(getGlobal(c), getWenku, filter);

  const items = await Promise.all(
    data.items.map(async (rawItem) => {
      const rawFeedURL = buildSite(c, `/bili/novel/${rawItem.nid}/feed.xml`);
      const foloId = await getFoloFeedId(rawFeedURL);
      const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
      const feedUrl = rawFeedURL;

      const dbItem = await getNovelFromDatabase('' + rawItem.nid, false);

      const author = dbItem?.authors
        ? dbItem.authors.map((author) => transformAuthor(author))
        : rawItem.author
          ? [transformAuthor({ name: rawItem.author, position: 'author' })]
          : undefined;

      return {
        title: dbItem?.name || rawItem.title,
        id: `/bili/novel/${rawItem.nid}`,
        link: `https://www.linovelib.com/novel/${rawItem.nid}.html`,
        author,
        content: `<p><a href=\"${`https://www.linovelib.com/novel/${rawItem.nid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>
<p>${dbItem?.description || rawItem.description}</p>
<p><img src="${dbItem?.cover || rawItem.cover}" alt="cover" /></p>`,
        image: dbItem?.cover || rawItem.cover,
        date: dbItem?.updatedAt || rawItem.updatedAt,
        categories: rawItem.tags
      };
    })
  );

  return getFeedResponse(c, {
    title: formatWenkuFilterTitle(filter),
    description:
      '轻小说文库，哔哩轻小说，是收录最全更新最快的动漫 sf 轻小说网站，提供轻小说在线阅读，TXT 与电子书下载。',
    link: new URL(data.url, 'https://www.linovelib.com').toString(),
    rssLink: buildSite(c, `/wenku/feed.xml${url.search}`),
    image: 'https://www.bilinovel.com/logo.png',
    items,
    follow: {
      feedId: await getFoloFeedId(getFeedURL(c)),
      userId: getFoloUserId()
    }
  });
});

app.get('/top/:sort/feed.xml', async (c: Context) => {
  const url = new URL(c.req.url);
  const filter = parseTopFilter(url);
  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: getTop.scope,
    workflow_key: getTop.key(filter),
    filter
  });
  const data = await engine.run(getGlobal(c), getTop, filter);

  const items = await Promise.all(
    data.items.map(async (rawItem) => {
      const rawFeedURL = buildSite(c, `/bili/novel/${rawItem.nid}/feed.xml`);
      const foloId = await getFoloFeedId(rawFeedURL);
      const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
      const feedUrl = rawFeedURL;

      const dbItem = await getNovelFromDatabase('' + rawItem.nid, false);

      const author = dbItem?.authors
        ? dbItem.authors.map((author) => transformAuthor(author))
        : rawItem.author
          ? [transformAuthor({ name: rawItem.author, position: 'author' })]
          : undefined;

      return {
        title: dbItem?.name || rawItem.title,
        id: `/bili/novel/${rawItem.nid}`,
        link: `https://www.linovelib.com/novel/${rawItem.nid}.html`,
        author,
        content: `<p><a href=\"${`https://www.linovelib.com/novel/${rawItem.nid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>
<p>${dbItem?.description || rawItem.description}</p>
<p><img src="${dbItem?.cover || rawItem.cover}" alt="cover" /></p>`,
        image: dbItem?.cover || rawItem.cover,
        date: dbItem?.updatedAt || rawItem.updatedAt
      };
    })
  );

  return getFeedResponse(c, {
    title: formatTopFilterTitle(filter),
    description:
      '轻小说文库，哔哩轻小说，是收录最全更新最快的动漫 sf 轻小说网站，提供轻小说在线阅读，TXT 与电子书下载。',
    link: new URL(data.url, 'https://www.linovelib.com').toString(),
    rssLink: buildSite(c, `/top/${filter.sort}/feed.xml${url.search}`),
    image: 'https://www.bilinovel.com/logo.png',
    items,
    follow: {
      feedId: await getFoloFeedId(getFeedURL(c)),
      userId: getFoloUserId()
    }
  });
});

app.get('/novel/:nid/feed.xml', validateNumericParams('nid'), async (c: Context) => {
  const nid = c.req.param('nid')!;

  const db = await getNovelFromDatabase(nid);

  if (db == null) {
    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: getNovel.scope,
      workflow_key: getNovel.key(+nid),
      novel_id: +nid
    });
  }
  const data = db ?? (await engine.run(getGlobal(c), getNovel, +nid));

  const author = data.authors.find((author) => author.position === 'author');

  const items = await Promise.all(
    data.volumes.map(async (vol, index) => {
      const rawFeedURL = buildSite(c, `/bili/novel/${nid}/vol/${vol.vid}/feed.xml`);
      const foloId = await getFoloFeedId(rawFeedURL);
      const foloUrl = foloId ? getFoloShareURL(foloId) : undefined;
      const feedUrl = rawFeedURL;

      const dbVol = await getNovelVolumeFromDatabase(nid, '' + vol.vid, false);

      return {
        title: vol.title || vol.volume,
        id: `/bili/novel/${nid}/vol/${vol.vid}`,
        link: `https://www.linovelib.com/novel/${nid}/vol_${vol.vid}.html`,
        // author: data.authors.map((author) => transformAuthor(author)),
        content: `<p><a href=\"${`https://www.linovelib.com/novel/${nid}/vol_${vol.vid}.html`}\">源链接</a> | <a href=\"${feedUrl}\" target=\"_blank\">RSS 订阅</a>${foloUrl ? ` | <a href=\"${foloUrl}\" target=\"_blank\">Folo 订阅</a>` : ''}</p>${dbVol?.description ? `<p>${dbVol.description}</p>` : ''}<p><img src="${vol.cover}" alt="cover" /></p>`,
        image: dbVol?.cover || vol.cover,
        // @hack 强制 feed item 的时间顺序, 防止阅读器重排序
        date: new Date(data.updatedAt.getTime() + 1000 * index),
        categories: data.labels
      };
    })
  );

  logger.info('Workflow requested', {
    event: 'workflow.requested',
    workflow: updateNovel.scope,
    workflow_key: updateNovel.key(+nid),
    novel_id: +nid,
    background: true
  });
  runTask(
    'workflow.background',
    { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
    () => engine.run(getGlobal(c), updateNovel, +nid)
  ).catch(() => {});

  return getFeedResponse(c, {
    title: data.name,
    description: normalizeDescription(data.description || data.name),
    link: `https://www.linovelib.com/novel/${nid}.html`,
    rssLink: buildSite(c, `/bili/novel/${nid}/feed.xml`),
    author: author ? transformAuthor(author) : undefined,
    image: data.cover,
    items,
    follow: {
      feedId: await getFoloFeedId(getFeedURL(c)),
      userId: getFoloUserId()
    }
  });
});

app.get(
  '/novel/:nid/vol/:vid/feed.xml',
  validateNumericParams('nid', 'vid'),
  async (c: Context) => {
    const nid = c.req.param('nid')!;
    const vid = c.req.param('vid')!;

    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: getNovelVolume.scope,
      workflow_key: getNovelVolume.key(+nid, +vid),
      novel_id: +nid,
      volume_id: +vid
    });
    const fetched = engine.run(getGlobal(c), getNovelVolume, +nid, +vid);
    const db = await getNovelVolumeFromDatabase(nid, vid);

    const data = db ? db : await fetched;

    const author = data.authors.find((author) => author.position === 'author');

    const chapters = [];
    for (const chapter of data.chapters) {
      const db = await getNovelChapterFromDatabase(nid, '' + chapter.cid);
      if (db) {
        chapters.push(db);
      } else {
        break;
      }
    }

    logger.info('Workflow requested', {
      event: 'workflow.requested',
      workflow: updateNovel.scope,
      workflow_key: updateNovel.key(+nid),
      novel_id: +nid,
      background: true
    });
    runTask(
      'workflow.background',
      { workflow: updateNovel.scope, workflow_key: updateNovel.key(+nid) },
      () => engine.run(getGlobal(c), updateNovel, +nid)
    ).catch(() => {});

    return getFeedResponse(c, {
      title: `${data.name}`,
      description: normalizeDescription(data.description),
      link: `https://www.linovelib.com/novel/${nid}/vol_${vid}.html`,
      rssLink: buildSite(c, `/bili/novel/${nid}/vol/${vid}/feed.xml`),
      author: author ? transformAuthor(author) : undefined,
      image: data.cover,
      items: chapters.map((chapter, index) => ({
        title: `${data.name} ${chapter.title}`,
        id: `/bili/novel/${nid}/chapter/${chapter.cid}`,
        link: `https://www.linovelib.com/novel/${nid}/${chapter.cid}.html`,
        // author: data.authors.map((author) => transformAuthor(author)),
        // @hack 强制 feed item 的时间顺序, 防止阅读器重排序
        date: new Date(data.updatedAt.getTime() + 1000 * index),
        categories: data.labels,
        content: chapter.content
      })),
      follow: {
        feedId: await getFoloFeedId(getFeedURL(c)),
        userId: getFoloUserId()
      }
    });
  }
);

function validateNumericParams(...names: string[]) {
  return async (c: Context, next: () => Promise<void>) => {
    for (const name of names) {
      const raw = c.req.param(name);
      const num = Number(raw);
      if (!raw || !Number.isInteger(num) || num < 0) {
        throw new HTTPException(400, {
          message: `Invalid route parameter: ${name}`
        });
      }
    }

    await next();
  };
}

async function attachFoloFeedId<T extends { nid: number | string }>(c: Context, item: T) {
  const feedUrl = buildSite(c, `/bili/novel/${item.nid}/feed.xml`);
  const foloFeedId = await getFoloFeedId(feedUrl);
  if (foloFeedId) {
    return { ...item, follow: { feedId: foloFeedId } };
  } else {
    return item;
  }
}

async function attachFoloVolumeFeedId<T extends { nid: number | string; vid: number | string }>(
  c: Context,
  item: T
) {
  const feedUrl = buildSite(c, `/bili/novel/${item.nid}/vol/${item.vid}/feed.xml`);
  const foloFeedId = await getFoloFeedId(feedUrl);
  if (foloFeedId) {
    return { ...item, follow: { feedId: foloFeedId } };
  } else {
    return item;
  }
}

async function attachFoloFeedIds<T extends { nid: number | string }>(c: Context, items: T[]) {
  return Promise.all(
    items.map(async (item) => {
      const feedUrl = buildSite(c, `/bili/novel/${item.nid}/feed.xml`);
      const foloFeedId = await getFoloFeedId(feedUrl);
      if (foloFeedId) {
        return { ...item, follow: { feedId: foloFeedId } };
      } else {
        return item;
      }
    })
  );
}

export async function updatePendingNovels(c: Context) {
  const now = new Date().toLocaleString();
  try {
    const novels = (await getNovelsFromDatabase({ done: false })).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    logger.info('Trigger updating pending novels', {
      event: 'trigger.updating.pending.novels',
      scheduled_at: now,
      novel_ids: novels.map((n) => n.nid),
      count: novels.length
    });
    for (const { nid } of novels) {
      const novel = await getNovelFromDatabase('' + nid, false);
      if (!novel || !novel.done) {
        logger.info('Workflow requested', {
          event: 'workflow.requested',
          workflow: updateNovel.scope,
          workflow_key: updateNovel.key(nid),
          novel_id: nid
        });
        await engine.run(getGlobal(c), updateNovel, nid);
      }
    }
  } catch (error) {
    logger.error(
      'Failed updating pending novels',
      { event: 'failed.updating.pending.novels', scheduled_at: now },
      error
    );
  } finally {
    logger.info('Finish updating pending novels', {
      event: 'finish.updating.pending.novels',
      scheduled_at: now
    });
  }
}

app.get('/files/*', async (c: Context) => {
  const pathname = new URL(c.req.url).pathname.replace(/^\/bili/, '');
  const target = new URL(pathname, `https://www.linovelib.com`);

  c.res.headers.set('X-Forward-Img', target.toString());

  logger.debug('Proxy fetch', {
    event: 'proxy.fetch',
    pathname: c.req.path,
    upstream_url: safeUrl(target)
  });

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

  logger.debug('Proxy fetch', {
    event: 'proxy.fetch',
    pathname: c.req.path,
    upstream_url: safeUrl(target)
  });

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
