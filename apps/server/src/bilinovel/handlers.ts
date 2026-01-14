import pLimit from 'p-limit';
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

// top 和 wenku 页使用的并发控制
const indexLimit = pLimit(1);

// novel 页使用的并发控制
const novelLimit = pLimit(1);

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

type MemoFn<F extends (...args: any[]) => Promise<any>> = F & {
  clear: () => void;
  delete: (...args: Parameters<F>) => void;
};

function memo<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  getKey: (...args: Parameters<F>) => string,
  options?: { ttl?: number }
): MemoFn<F> {
  const map = new Map<string, Promise<Awaited<ReturnType<F>>>>();

  const wrapped = (async (...args: Parameters<F>) => {
    const key = getKey(...args);
    const existing = map.get(key);
    if (existing) return existing;

    const promise = fn(...args);
    map.set(key, promise);

    try {
      const result = await promise;

      const ttl = options?.ttl ?? 0;
      if (ttl === 0) {
        // ttl === 0: 不缓存结果
        if (map.get(key) === promise) {
          map.delete(key);
        }
      } else if (ttl > 0) {
        // ttl > 0: 缓存 ttl ms
        setTimeout(() => {
          if (map.get(key) === promise) {
            map.delete(key);
          }
        }, ttl);
      } else {
        // ttl < 0: 无限缓存
      }

      return result;
    } catch (error) {
      if (map.get(key) === promise) {
        map.delete(key);
      }

      throw error;
    }
  }) as MemoFn<F>;

  wrapped.clear = () => {
    map.clear();
  };

  wrapped.delete = (...args) => {
    const key = getKey(...args);
    map.delete(key);
  };

  return wrapped;
}

function getWenkuFilterKey(filter: BilinovelFetchWenkuFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'bilinovel:wenku:' + entries.sort().join('&');
}

function getTopFilterKey(filter: BilinovelFetchTopFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'bilinovel:top:' + entries.sort().join('&');
}

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
              await triggerUpdateNovels(
                c,
                resp.items.map((item) => item.nid)
              );
            }, 1000);

            return resp;
          } catch (error) {
            consola.error(`Failed fetching wenku page`, filter, error);

            throw error;
          }
        },
        {
          cache: wenkuCache,
          limit: indexLimit,
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
  },
  {
    ttl: 10 * 1000
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
              await triggerUpdateNovels(
                c,
                resp.items.map((item) => item.nid)
              );
            }, 1000);

            return resp;
          } catch (error) {
            consola.error(`Finish fetching top page`, filter, error);

            throw error;
          }
        },
        {
          cache: topCache,
          limit: indexLimit,
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
  },
  {
    ttl: 10 * 1000
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
              },
              logger: consola
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
          limit: novelLimit,
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
  (_, nid) => nid,
  {
    ttl: 10 * 1000
  }
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
              },
              logger: consola
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
          limit: novelLimit,
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
  (_, nid, vid) => `${nid}/${vid}`,
  {
    ttl: 10 * 1000
  }
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
              transformImgSrc: buildSite(c, '/bili/img3/'),
              logger: consola
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
          limit: novelLimit,
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
  (_, nid, cid) => `${nid}/${cid}`,
  {
    ttl: 10 * 1000
  }
);

let pending: Promise<void> | undefined;
const pendingNids: number[] = [];
export async function triggerUpdateNovels(c: Context, nids: number[]) {
  for (const nid of nids) {
    if (!pendingNids.includes(nid)) {
      pendingNids.push(nid);
    }
  }

  if (!pending) {
    pending = new Promise(async (res) => {
      const running = new Set<number>();
      const done = new Set<number>();
      while (done.size < pendingNids.length) {
        await waitBrowserIdle(novelLimit, {
          threshold: 0,
          timeout: 10 * 1000 + 10 * 1000 * Math.random()
        });
        for (const nid of pendingNids) {
          if (running.has(nid)) continue;
          running.add(nid);
          try {
            getNovel(c, '' + nid).finally(() => {
              done.add(nid);
            });
          } catch {}
        }
      }
      pending = undefined;
      pendingNids.splice(0, pendingNids.length);
      res();
    });
  }
  await pending;
}

export const triggerUpdateNovel = memo(
  async (c: Context, nid: string, novel: NovelPageResult) => {
    consola.log(
      `Start updating novel to database`,
      `nid:${nid}`,
      novel.name,
      novel.updatedAt.toLocaleString()
    );

    let failed = 0;

    try {
      await database
        .insert(biliNovels)
        .values({
          nid: +nid,
          name: novel.name,
          authors: novel.authors,
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
            authors: novel.authors,
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

      // 并发更新所有 volume
      await Promise.all(
        novel.volumes.map(async (novelVolume) => {
          await waitBrowserIdle(novelLimit, { threshold: 5 });
          const resp = await triggerUpdateNovelVolume(c, novel, novelVolume);
          if (!resp.ok) {
            failed++;
          }
        })
      );
    } catch (error) {
      triggerUpdateNovel.delete(c, nid, novel);

      consola.log(
        `Failed updating novel to database`,
        `nid:${nid}`,
        novel.name,
        novel.updatedAt.toLocaleString(),
        error
      );

      return;
    }

    if (failed === 0) {
      await database.update(biliNovels).set({ done: true }).where(eq(biliNovels.nid, +nid));

      consola.log(
        `Finish updating novel to database`,
        `nid:${nid}`,
        novel.name,
        novel.updatedAt.toLocaleString()
      );
    } else {
      triggerUpdateNovel.delete(c, nid, novel);

      consola.log(
        `Failed updating novel to database`,
        `nid:${nid}`,
        novel.name,
        novel.updatedAt.toLocaleString()
      );
    }
  },
  (_, nid) => nid,
  {
    ttl: 24 * 60 * 60 * 1000
  }
);

export const triggerUpdateNovelVolume = memo(
  async (c: Context, novel: NovelPageResult, novelVolume: NovelPageResult['volumes'][number]) => {
    const nid = novel.nid;
    const vid = novelVolume.vid;

    consola.log(
      `Start updating novel volume to database`,
      `nid:${nid}`,
      novel.name,
      `vid:${vid}`,
      novelVolume.title
    );

    const resp = await getNovelVolume(c, '' + nid, '' + vid);

    if (resp.ok) {
      const { data: fetchedVolume } = resp;

      const [oldVolume] = await database
        .select()
        .from(biliVolumes)
        .where(eq(biliVolumes.vid, +vid));

      await database
        .insert(biliVolumes)
        .values({
          vid,
          nid: +nid,
          name: novelVolume.title,
          volume: novelVolume.volume,
          description: fetchedVolume.description,
          cover: novelVolume.cover,
          labels: fetchedVolume.labels,
          done: false,
          updatedAt: fetchedVolume.updatedAt,
          fetchedAt: new Date()
        })
        .onConflictDoUpdate({
          target: biliVolumes.vid,
          set: {
            name: novelVolume.title,
            volume: novelVolume.volume,
            description: fetchedVolume.description,
            cover: novelVolume.cover,
            done: false,
            updatedAt: fetchedVolume.updatedAt,
            fetchedAt: new Date()
          }
        });

      // 视为数据一致: 数据库条目存在 且 数据库条目 done 且 数据库条目更新时间 >= 抓取的更新时间
      if (
        oldVolume &&
        oldVolume.done &&
        oldVolume.updatedAt.getTime() >= fetchedVolume.updatedAt.getTime()
      ) {
        await database.update(biliVolumes).set({ done: true }).where(eq(biliVolumes.vid, +vid));

        consola.log(
          `Skip updating novel volume to database`,
          `nid:${nid}`,
          novel.name,
          `vid:${vid}`,
          novelVolume.title
        );

        return { ok: true };
      }

      let isFailed = false;

      for (let index = 0; index < fetchedVolume.chapters.length; index++) {
        const ch = fetchedVolume.chapters[index];

        await waitBrowserIdle(novelLimit, { threshold: 5 });

        const resp = await getNovelChapter(c, '' + nid, '' + ch.cid);

        if (resp.ok) {
          const { data: chapter } = resp;

          await database
            .insert(biliChapters)
            .values({
              cid: ch.cid,
              vid: novelVolume.vid,
              nid: +nid,
              title: ch.title,
              content: chapter.content,
              images: chapter.images,
              index,
              fetchedAt: new Date()
            })
            .onConflictDoUpdate({
              target: biliChapters.cid,
              set: {
                title: ch.title,
                content: chapter.content,
                images: chapter.images,
                index,
                fetchedAt: new Date()
              }
            });
        } else {
          isFailed = true;
          break;
        }
      }

      if (!isFailed) {
        // 异步更新 foloId
        setFoloFeedId(buildSite(c, `/bili/novel/${nid}/vol/${vid}/feed.xml`));

        await database.update(biliVolumes).set({ done: true }).where(eq(biliVolumes.vid, +vid));

        consola.log(
          `Finish updating novel volume to database`,
          `nid:${nid}`,
          novel.name,
          `vid:${vid}`,
          novelVolume.title
        );

        return { ok: true };
      } else {
        consola.log(
          `Failed updating novel volume to database`,
          `nid:${nid}`,
          novel.name,
          `vid:${vid}`,
          novelVolume.title
        );

        triggerUpdateNovelVolume.delete(c, novel, novelVolume);

        return { ok: false };
      }
    } else {
      consola.log(
        `Failed updating novel volume to database`,
        `nid:${nid}`,
        novel.name,
        `vid:${vid}`,
        novelVolume.title
      );

      triggerUpdateNovelVolume.delete(c, novel, novelVolume);

      return { ok: false };
    }
  },
  (_, novel, novelVolume) => `${novel.nid}/${novelVolume.vid}`,
  {
    ttl: 24 * 60 * 60 * 1000
  }
);
