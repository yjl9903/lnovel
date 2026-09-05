import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep route handlers, middleware, parsing and RSS serialization real; replace I/O boundaries.
const io = vi.hoisted(() => ({
  run: vi.fn(),
  novel: vi.fn(),
  novels: vi.fn(),
  volume: vi.fn(),
  chapter: vi.fn(),
  feedId: vi.fn(),
  setFeedId: vi.fn()
}));
vi.mock('../src/bilinovel/database', () => ({
  getNovelFromDatabase: io.novel,
  getNovelsFromDatabase: io.novels,
  getNovelVolumeFromDatabase: io.volume,
  getNovelChapterFromDatabase: io.chapter
}));
vi.mock('../src/folo', () => ({
  getFoloUserId: () => undefined,
  getFoloFeedId: io.feedId,
  getFoloShareURL: (id: string) => `https://app.folo.is/share/feeds/${id}`,
  setFoloFeedId: io.setFeedId
}));
vi.mock('../src/bilinovel/workflow', () => ({
  engine: { run: io.run, getStores: () => [] },
  getGlobal: () => ({}),
  ...Object.fromEntries(
    [
      'getTop',
      'getWenku',
      'getNovel',
      'getNovelVolume',
      'updateNovel',
      'updateNovelVolume',
      'updateNovelChapter'
    ].map((scope) => [scope, { scope, key: () => scope }])
  ),
  WorkflowException: class extends Error {}
}));

import { createApp } from '../src/app';
import { initializeLogging } from '../src/logging';

initializeLogging({ write: (_line, done) => done() });
import { transformImgSrc } from '../src/bilinovel/utils';

const origin = 'https://public.example';
const cover = `${origin}/bili/files/cover.jpg`;
const novel = {
  nid: 1,
  name: '测试小说',
  description: '简介',
  authors: [],
  labels: [],
  cover,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  volumes: [{ nid: 1, vid: 2, title: '第一卷', volume: '第一卷', cover }]
};
const volume = {
  ...novel,
  vid: 2,
  name: '第一卷',
  chapters: [{ nid: 1, vid: 2, cid: 3, title: '第一章' }]
};
const chapter = {
  nid: 1,
  vid: 2,
  cid: 3,
  title: '第一章',
  content: `<p>章节</p><img src="${origin}/bili/img3/chapter.jpg"/>`,
  images: []
};
const listing = {
  url: 'https://www.linovelib.com/top/weekvisit/1.html',
  items: [{ nid: 1, title: novel.name, cover, updatedAt: novel.updatedAt }]
};
const feeds = [
  '/bili/novels/feed.xml',
  '/bili/wenku/feed.xml',
  '/bili/top/weekvisit/feed.xml',
  '/bili/novel/1/feed.xml',
  '/bili/novel/1/vol/2/feed.xml'
];
const jsonPaths = [
  '/bili/',
  '/bili/contexts',
  '/bili/wenku',
  '/bili/top/weekvisit',
  '/bili/novels',
  '/bili/novel/1',
  '/bili/novel/1/vol/2',
  '/bili/novel/1/chapter/3'
];
const app = createApp();

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  io.novel.mockResolvedValue(novel);
  io.novels.mockResolvedValue([novel]);
  io.volume.mockResolvedValue(volume);
  io.chapter.mockResolvedValue(chapter);
  io.run.mockImplementation(async (_global, workflow) => {
    if (['getTop', 'getWenku'].includes(workflow.scope)) return listing;
    if (workflow.scope === 'getNovel') return { ...novel, name: '刷新小说' };
    if (['getNovelVolume', 'updateNovelVolume'].includes(workflow.scope)) return volume;
    if (workflow.scope === 'updateNovelChapter') return chapter;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request');
    })
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('API namespace and retained resources', () => {
  it.each(jsonPaths)('moves JSON %s without a legacy alias', async (path) => {
    const response = await app.request(`${origin}/api${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ ok: true, provider: 'bilinovel' });
    const old = await app.request(`${origin}${path}`);
    expect(old.status).toBe(404);
    expect(old.headers.has('location')).toBe(false);
  });

  it('preserves force and filtering on the new JSON paths', async () => {
    const cached = await app.request('/api/bili/novel/1');
    expect(await cached.json()).toMatchObject({ data: { name: '测试小说' } });
    const forced = await app.request('/api/bili/novel/1?force=1');
    expect(await forced.json()).toMatchObject({ data: { name: '刷新小说' } });
    const top = await app.request('/api/bili/top/weekvisit?page=2');
    expect(await top.json()).toMatchObject({ filter: { sort: 'weekVisit', page: 2 } });
    const wenku = await app.request('/api/bili/wenku?page=3');
    expect(await wenku.json()).toMatchObject({ filter: { page: 3 } });
  });

  it.each(feeds)('keeps RSS %s and its item identities and links', async (path) => {
    const response = await app.request(`${origin}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    const xml = await response.text();
    expect(xml).toContain('<rss version="2.0"');
    const isVolume = path.includes('/vol/');
    const isNovel = path === '/bili/novel/1/feed.xml';
    const itemId = isVolume
      ? '/bili/novel/1/chapter/3'
      : isNovel
        ? '/bili/novel/1/vol/2'
        : '/bili/novel/1';
    expect(xml).toContain(`<guid isPermaLink="false">${itemId}</guid>`);
    expect(xml).toContain(isVolume ? `${origin}/bili/img3/chapter.jpg` : cover);
    if (!isVolume) expect(xml).toContain(`${origin}${itemId}/feed.xml`);
    expect(xml).not.toContain('/api/');
    expect(io.feedId).toHaveBeenCalledWith(`${origin}${path}`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(io.setFeedId).toHaveBeenCalledWith(new URL(`${origin}${path}`));
    expect((await app.request(`/api${path}`)).status).toBe(404);
    await vi.advanceTimersByTimeAsync(1000);
    expect(io.setFeedId).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/bili/files/cover.jpg', 'https://www.linovelib.com/files/cover.jpg'],
    ['/bili/img3/cover.jpg', 'https://img3.readpai.com/cover.jpg']
  ])('keeps image proxy %s and upstream mapping', async (path, upstream) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=123' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(transformImgSrc(origin, upstream)).toBe(`${origin}${path}`);
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL(upstream), expect.any(Object));
    expect(response.headers.get('x-forward-img')).toBe(upstream);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=123');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await app.request(`/api${path}`)).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    expect((await app.request(path)).status).toBe(404);
  });

  it('retains distinct JSON and RSS error responses', async () => {
    io.run.mockRejectedValue(new Error('upstream unavailable'));
    const json = await app.request('/api/bili/top/weekvisit');
    expect(json.status).toBe(500);
    expect(await json.json()).toMatchObject({ ok: false, message: 'upstream unavailable' });
    const rss = await app.request('/bili/top/weekvisit/feed.xml');
    expect(rss.status).toBe(500);
    expect(rss.headers.get('content-type')).toContain('text/html');
    expect(await rss.text()).toContain('Request Error: upstream unavailable');
  });

  it.each([
    ['/api/bili/top/weekvisit', 408],
    ['/bili/top/weekvisit/feed.xml', 500]
  ])('retains timeout behavior for %s', async (path, status) => {
    io.run.mockReturnValue(new Promise(() => {}));
    const pending = app.request(path);
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await pending;
    expect(response.status).toBe(status);
    expect(await response.text()).toContain('Request timeout');
  });
});
