import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';

import {
  type NovelPageResult,
  type NovelVolumePageResult,
  type NovelChaptersResult,
  fetchNovelChapters,
  fetchNovelPage,
  fetchNovelVolumePage
} from 'bilinovel';

import type { Context } from '../app';

import { database } from '../database';
import { biliChapters, biliNovels, biliVolumes } from '../schema';
import { launchBrowser, runBrowserContextWithCache } from '../browser';

import { consola, buildSite } from './utils';

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

export const getNovel = memo(
  async (c: Context, nid: string) => {
    try {
      const data = await runBrowserContextWithCache(
        browser,
        novelCache,
        `${nid}`,
        async (context) => {
          consola.log(`Fetch novel page`, nid);

          return await fetchNovelPage(context, +nid, {
            transformImgSrc(_url) {
              const url = new URL(_url);
              if (url.host === 'img3.readpai.com') {
                return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
              }
              if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                return buildSite(c, `/bili${url.pathname}${url.search}`);
              }
              return _url;
            }
          });
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
      const data = await runBrowserContextWithCache(
        browser,
        volCache,
        `${nid}/vol_${vid}`,
        async (context) => {
          consola.log(`Fetch novel volume page`, nid, vid);

          return await fetchNovelVolumePage(context, +nid, +vid, {
            transformImgSrc(_url) {
              const url = new URL(_url);
              if (url.host === 'img3.readpai.com') {
                return buildSite(c, `/bili/img3${url.pathname}${url.search}`);
              }
              if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
                return buildSite(c, `/bili${url.pathname}${url.search}`);
              }
              return _url;
            }
          });
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
      const data = await runBrowserContextWithCache(
        browser,
        chapterCache,
        `${nid}/${cid}`,
        async (context) => {
          consola.log(`Fetch novel chapter page`, nid, cid);

          return await fetchNovelChapters(context, +nid, +cid, {
            transformRuby: true,
            transformImgSrc: buildSite(c, '/bili/img3/')
          });
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

export const triggerUpdateNovel = memo(
  async (c: Context, nid: string, novel: NovelPageResult) => {
    const [oldNovel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

    if (oldNovel && oldNovel.done && oldNovel.updatedAt.getTime() === novel.updatedAt.getTime()) {
      return;
    }

    await database
      .insert(biliNovels)
      .values({
        nid: +nid,
        name: novel.name,
        description: novel.description,
        cover: novel.cover,
        labels: novel.labels,
        updatedAt: novel.updatedAt,
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
          fetchedAt: new Date()
        }
      });

    let error = 0;

    for (const vol of novel.volumes) {
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
            error++;
          }
        }
      } else {
        error++;
      }
    }

    if (error === 0) {
      await database.update(biliNovels).set({ done: true }).where(eq(biliNovels.nid, +nid));
    }
  },
  (_, nid) => nid
);
