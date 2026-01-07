import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';

import {
  type NovelPageResult,
  type NovelVolumePageResult,
  type NovelChaptersResult,
  type BilinovelFetchTopFilter,
  type BilinovelFetchWenkuFilter,
  fetchNovelChapters,
  fetchNovelPage,
  fetchNovelVolumePage,
  fetchTopPage,
  fetchWenkuPage
} from 'bilinovel';

import type { Context } from '../app';

import { database } from '../database';
import { setFoloFeedId } from '../folo';
import { buildSite, sleep } from '../utils';
import { biliChapters, biliNovels, biliVolumes } from '../schema';
import { launchBrowser, runBrowserContext, waitBrowserIdle } from '../browser';

import { consola } from './utils';

const MAX_RETRY = 1;

const browser = launchBrowser({
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
});

const wenkuCache = new LRUCache<string, Awaited<ReturnType<typeof fetchWenkuPage>> & {}>({
  max: 1000,
  ttl: 60 * 60 * 1000
});

const topCache = new LRUCache<string, Awaited<ReturnType<typeof fetchTopPage>> & {}>({
  max: 1000,
  ttl: 60 * 60 * 1000
});

const novelCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelPage>> & {}>({
  max: 1000,
  ttl: 60 * 60 * 1000
});

const volCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelVolumePage>> & {}>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000
});

const chapterCache = new LRUCache<string, Awaited<ReturnType<typeof fetchNovelChapters>> & {}>({
  max: 100,
  ttl: 24 * 60 * 60 * 1000
});

function memo<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  getKey: (...args: Parameters<F>) => string,
  keepDuration: number = 2000
): F {
  const map = new Map<string, ReturnType<F>>();

  return (async (...args) => {
    const key = getKey(...(args as any));
    if (map.get(key)) {
      return map.get(key);
    }

    try {
      const promise = fn(...args);
      map.set(key, promise as any);
      const result = await promise;
      setTimeout(() => {
        map.delete(key);
      }, keepDuration);
      return result;
    } catch (error) {
      map.delete(key);
      throw error;
    }
  }) as F;
}

function getWenkuFilterKey(filter: BilinovelFetchWenkuFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'bilinovel:wenku:' + entries.sort().join('&');
}

function getTopFilterKey(filter: BilinovelFetchTopFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'bilinovel:top:' + entries.sort().join('&');
}

// 正在运行的异步拉取任务 id
const runningTasks = new Set<string>();

export const getWenku = memo(
  async (c: Context, filter: BilinovelFetchWenkuFilter) => {
    try {
      const data = await runBrowserContext(
        browser,
        getWenkuFilterKey(filter),
        async (context) => {
          try {
            consola.log(`Start fetching wenku page`, filter);

            const resp = await fetchWenkuPage(context, filter, {
              transformImgSrc(_url) {
                try {
                  if (_url.startsWith('/files/')) {
                    _url = 'https://www.linovelib.com' + _url;
                  }

                  const url = new URL(_url);
                  if (url.host === 'img3.readpai.com') {
                    return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
                  }
                  if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                    return buildSite(c, `/bili${url.pathname}${url.search}`);
                  }
                  return _url;
                } catch (error) {
                  consola.error('Transform img src', error, _url);
                  return _url;
                }
              }
            });

            consola.log(
              `Finish fetching wenku page`,
              filter,
              resp.items.map((item) => ({ title: item.title, nid: item.nid }))
            );

            // 延迟拉取所有 novel
            setTimeout(async () => {
              const key = getWenkuFilterKey(filter);
              if (runningTasks.has(key)) return;
              try {
                runningTasks.add(key);
                await triggerUpdateNovels(
                  c,
                  resp.items.map((item) => item.nid)
                );
              } finally {
                runningTasks.delete(key);
              }
            }, 1000);

            return resp;
          } catch (error) {
            consola.error(`Failed fetching wenku page`, filter, error);

            throw error;
          }
        },
        {
          cache: wenkuCache,
          maxRetry: MAX_RETRY
        }
      );

      if (!data) {
        return {
          ok: false,
          status: 404,
          message: 'not found'
        } as const;
      }

      return {
        ok: true,
        status: 200,
        data
      } as const;
    } catch (error) {
      consola.error(error);

      return {
        ok: false,
        status: 500 as const,
        message: (error as any)?.message
      } as const;
    }
  },
  (_, filter) => {
    return getWenkuFilterKey(filter);
  }
);

export const getTop = memo(
  async (c: Context, filter: BilinovelFetchTopFilter) => {
    try {
      const data = await runBrowserContext(
        browser,
        getTopFilterKey(filter),
        async (context) => {
          try {
            consola.log(`Start fetching top page`, filter);

            const resp = await fetchTopPage(context, filter, {
              transformImgSrc(_url) {
                try {
                  if (_url.startsWith('/files/')) {
                    _url = 'https://www.linovelib.com' + _url;
                  }

                  const url = new URL(_url);
                  if (url.host === 'img3.readpai.com') {
                    return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
                  }
                  if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                    return buildSite(c, `/bili${url.pathname}${url.search}`);
                  }
                  return _url;
                } catch (error) {
                  consola.error('Transform img src', error, _url);
                  return _url;
                }
              }
            });

            consola.log(
              `Finish fetching top page`,
              filter,
              resp.items.map((item) => ({ title: item.title, nid: item.nid }))
            );

            // 延迟拉取所有 novel
            setTimeout(async () => {
              const key = getTopFilterKey(filter);
              if (runningTasks.has(key)) return;
              try {
                runningTasks.add(key);
                await triggerUpdateNovels(
                  c,
                  resp.items.map((item) => item.nid)
                );
              } finally {
                runningTasks.delete(key);
              }
            }, 1000);

            return resp;
          } catch (error) {
            consola.error(`Finish fetching top page`, filter, error);

            throw error;
          }
        },
        {
          cache: topCache,
          maxRetry: MAX_RETRY
        }
      );

      if (!data) {
        return {
          ok: false,
          status: 404,
          message: 'not found'
        } as const;
      }

      return {
        ok: true,
        status: 200,
        data
      } as const;
    } catch (error) {
      consola.error(error);

      return {
        ok: false,
        status: 500 as const,
        message: (error as any)?.message
      } as const;
    }
  },
  (_, filter) => {
    return getTopFilterKey(filter);
  }
);

export const getNovel = memo(
  async (c: Context, nid: string) => {
    try {
      const data = await runBrowserContext(
        browser,
        `bilinovel:novel:${nid}`,
        async (context) => {
          try {
            consola.log(`Start fetching novel page`, `nid:${nid}`);

            const resp = await fetchNovelPage(context, +nid, {
              transformImgSrc(_url) {
                try {
                  if (_url.startsWith('/files/')) {
                    _url = 'https://www.linovelib.com' + _url;
                  }

                  const url = new URL(_url);
                  if (url.host === 'img3.readpai.com') {
                    return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
                  }
                  if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                    return buildSite(c, `/bili${url.pathname}${url.search}`);
                  }
                  return _url;
                } catch (error) {
                  consola.error('Transform img src', error, _url);
                  return _url;
                }
              }
            });

            consola.log(`Finish fetching novel page`, `nid:${nid}`, resp?.name);

            return resp;
          } catch (error) {
            consola.error(`Failed fetching novel page`, `nid:${nid}`, error);

            throw error;
          }
        },
        {
          cache: novelCache,
          maxRetry: MAX_RETRY
        }
      );

      if (!data) {
        return {
          ok: false,
          status: 404,
          message: 'not found'
        } as const;
      }

      triggerUpdateNovel(c, nid, data);

      return {
        ok: true,
        status: 200,
        data
      } as const;
    } catch (error) {
      consola.error(error);

      return {
        ok: false,
        status: 500 as const,
        message: (error as any)?.message
      } as const;
    }
  },
  (_, nid) => nid
);

export const getNovelVolume = memo(
  async (c: Context, nid: string, vid: string) => {
    try {
      const data = await runBrowserContext(
        browser,
        `bilinovel:novel:${nid}:vol:${vid}`,
        async (context) => {
          try {
            consola.log(`Start fetching novel volume page`, `nid:${nid}`, `vid:${vid}`);

            const resp = await fetchNovelVolumePage(context, +nid, +vid, {
              transformImgSrc(_url) {
                try {
                  if (_url.startsWith('/files/')) {
                    _url = 'https://www.linovelib.com' + _url;
                  }

                  const url = new URL(_url);
                  if (url.host === 'img3.readpai.com') {
                    return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
                  }
                  if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                    return buildSite(c, `/bili${url.pathname}${url.search}`);
                  }
                  return _url;
                } catch (error) {
                  consola.error('Transform img src', error, _url);
                  return _url;
                }
              }
            });

            consola.log(
              `Finish fetching novel volume page`,
              `nid:${nid}`,
              `vid:${vid}`,
              resp?.name
            );

            return resp;
          } catch (error) {
            consola.error(`Failed fetching novel volume page`, `nid:${nid}`, `vid:${vid}`, error);

            throw error;
          }
        },
        {
          cache: volCache,
          maxRetry: MAX_RETRY
        }
      );

      if (!data) {
        return {
          ok: false,
          status: 404,
          message: 'not found'
        } as const;
      }

      return {
        ok: true,
        status: 200,
        data
      } as const;
    } catch (error) {
      consola.error(error);

      return {
        ok: false,
        status: 500 as const,
        message: (error as any)?.message
      } as const;
    }
  },
  (_, nid, vid) => `${nid}/${vid}`
);

export const getNovelChapter = memo(
  async (c: Context, nid: string, cid: string) => {
    try {
      const data = await runBrowserContext(
        browser,
        `bilinovel:novel:${nid}:chapter:${cid}`,
        async (context) => {
          try {
            consola.log(`Start fetching novel chapter page`, `nid:${nid}`, `cid:${cid}`);

            const resp = await fetchNovelChapters(context, +nid, +cid, {
              transformBbcode: true,
              transformImgSrc: buildSite(c, '/bili/img3/')
            });

            consola.log(
              `Finish fetching novel chapter page`,
              `nid:${nid}`,
              `cid:${cid}`,
              resp?.title
            );

            return resp;
          } catch (error) {
            consola.error(`Failed fetching novel chapter page`, `nid:${nid}`, `cid:${cid}`, error);

            throw error;
          }
        },
        {
          cache: chapterCache,
          maxRetry: MAX_RETRY
        }
      );

      if (!data) {
        return {
          ok: false,
          status: 404,
          message: 'not found'
        } as const;
      }

      return {
        ok: true,
        status: 200,
        data
      } as const;
    } catch (error) {
      consola.error(error);

      return {
        ok: false,
        status: 500 as const,
        message: (error as any)?.message
      } as const;
    }
  },
  (_, nid, cid) => `${nid}/${cid}`
);

export const getNovelByDatabase = async (nid: string): Promise<NovelPageResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel && novel.done) {
    const volumes = await database.select().from(biliVolumes).where(eq(biliVolumes.nid, +nid));

    return {
      nid: novel.nid,
      name: novel.name,
      description: novel.description,
      cover: novel.cover || undefined,
      labels: novel.labels || [],
      updatedAt: novel.updatedAt,
      fetchedAt: novel.fetchedAt,
      volumes: volumes.map((vol) => ({
        nid: +nid,
        vid: vol.vid,
        title: vol.name,
        cover: vol.cover || '',
        volume: vol.volume
      }))
    };
  }

  return undefined;
};

export const getPendingNovels = async () => {
  const novels = await database.select().from(biliNovels).where(eq(biliNovels.done, false));
  return novels;
};

export const getNovelVolumeByDatabase = async (
  nid: string,
  vid: string
): Promise<NovelVolumePageResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel && novel.done) {
    const [volume] = await database.select().from(biliVolumes).where(eq(biliVolumes.vid, +vid));

    if (volume) {
      const chapters = await database.select().from(biliChapters).where(eq(biliChapters.vid, +vid));

      return {
        nid: volume.nid,
        vid: volume.vid,
        name: volume.name,
        labels: volume.labels,
        description: volume.description,
        cover: volume.cover || '',
        chapters: chapters.map((ch) => ({ nid: +nid, vid: +vid, cid: ch.cid, title: ch.title })),
        updatedAt: volume.updatedAt,
        fetchedAt: volume.fetchedAt
      };
    }
  }

  return undefined;
};

export const getNovelChapterByDatabase = async (
  nid: string,
  cid: string
): Promise<NovelChaptersResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel && novel.done) {
    const [chapter] = await database.select().from(biliChapters).where(eq(biliChapters.cid, +cid));

    if (chapter) {
      return {
        nid: +nid,
        cid: +cid,
        title: chapter.title,
        content: chapter.content,
        images: chapter.images,
        fetchedAt: chapter.fetchedAt
      };
    }
  }

  return undefined;
};

export async function triggerUpdateNovels(c: Context, nids: number[]) {
  for (const nid of nids) {
    try {
      await waitBrowserIdle();
      await getNovel(c, '' + nid);
      await sleep(30 * 1000 + 60 * 1000 * Math.random());
    } catch {}
  }
}

export const triggerUpdateNovel = memo(
  async (c: Context, nid: string, novel: NovelPageResult) => {
    const [oldNovel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));
    const oldVolumes = await database.select().from(biliVolumes).where(eq(biliVolumes.nid, +nid));

    if (
      oldNovel &&
      oldNovel.done &&
      oldNovel.updatedAt.getTime() === novel.updatedAt.getTime() &&
      oldVolumes.length === novel.volumes.length
    ) {
      consola.log(
        `Skip updating novel to database`,
        nid,
        novel.name,
        novel.updatedAt.toISOString()
      );
      return;
    }

    consola.log(`Start updating novel to database`, nid, novel.name, novel.updatedAt.toISOString());

    let failed = 0;

    try {
      await database
        .insert(biliNovels)
        .values({
          nid: +nid,
          name: novel.name,
          description: novel.description,
          cover: novel.cover,
          labels: novel.labels,
          updatedAt: novel.updatedAt,
          done: false,
          fetchedAt: new Date()
        })
        .onConflictDoUpdate({
          target: biliNovels.nid,
          set: {
            name: novel.name,
            description: novel.description,
            cover: novel.cover,
            labels: novel.labels,
            updatedAt: novel.updatedAt,
            done: false,
            fetchedAt: new Date()
          }
        });

      // 异步更新 foloId
      setFoloFeedId(buildSite(c, `/bili/novel/${nid}/feed.xml`));

      for (const vol of novel.volumes) {
        await waitBrowserIdle(5);

        await new Promise((res) => setTimeout(res, 1000 + Math.floor(Math.random() * 1000)));

        const resp = await getNovelVolume(c, nid, '' + vol.vid);

        if (resp.ok) {
          const { data: volume } = resp;

          await database
            .insert(biliVolumes)
            .values({
              vid: vol.vid,
              nid: +nid,
              name: vol.title,
              volume: vol.volume,
              description: volume.description,
              cover: vol.cover,
              labels: volume.labels,
              updatedAt: volume.updatedAt,
              fetchedAt: new Date()
            })
            .onConflictDoUpdate({
              target: biliVolumes.vid,
              set: {
                name: vol.title,
                volume: vol.volume,
                description: volume.description,
                cover: vol.cover,
                updatedAt: volume.updatedAt,
                fetchedAt: new Date()
              }
            });

          for (const ch of volume.chapters) {
            await new Promise((res) => setTimeout(res, 1000 + Math.floor(Math.random() * 1000)));

            const resp = await getNovelChapter(c, nid, '' + ch.cid);

            if (resp.ok) {
              const { data: chapter } = resp;

              await database
                .insert(biliChapters)
                .values({
                  cid: ch.cid,
                  vid: vol.vid,
                  nid: +nid,
                  title: ch.title,
                  content: chapter.content,
                  images: chapter.images,
                  fetchedAt: new Date()
                })
                .onConflictDoUpdate({
                  target: biliChapters.cid,
                  set: {
                    title: ch.title,
                    content: chapter.content,
                    images: chapter.images,
                    fetchedAt: new Date()
                  }
                });
            } else {
              failed++;
            }
          }

          // 异步更新 foloId
          setFoloFeedId(buildSite(c, `/bili/novel/${nid}/vol/${vol.vid}/feed.xml`));
        } else {
          failed++;
        }
      }
    } catch (error) {
      consola.log(
        `Failed updating novel to database`,
        nid,
        novel.name,
        novel.updatedAt.toISOString(),
        error
      );
    }

    if (failed === 0) {
      await database.update(biliNovels).set({ done: true }).where(eq(biliNovels.nid, +nid));

      consola.log(
        `Finish updating novel to database`,
        nid,
        novel.name,
        novel.updatedAt.toISOString()
      );
    } else {
      consola.log(
        `Failed updating novel to database`,
        nid,
        novel.name,
        novel.updatedAt.toISOString()
      );
    }
  },
  (_, nid) => nid
);
