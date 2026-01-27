import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { workflow, newQueue, createEngine, Context, Workflow } from 'flomise';

import {
  type BilinovelFetchTopFilter,
  type BilinovelFetchWenkuFilter,
  fetchTopPage,
  fetchWenkuPage,
  fetchNovelPage,
  fetchNovelVolumePage,
  fetchNovelChapterPages
} from 'bilinovel';

import type { Context as HonoContext } from '../app';

import { database } from '../database';
import { setFoloFeedId } from '../folo';
import { biliChapters, biliNovels, biliVolumes } from '../schema';

import { consola, transformImgSrc, tryResult } from './utils';
import { type Session, createBilinovelSession } from './browser';
import { getNovelFromDatabase, updateNovelChapterToDatabase } from './database';

// top 和 wenku 页使用的并发控制
const indexLimit = newQueue(1);

export const engine = createEngine();

export interface Global {
  origin: string;

  session: Session;
}

export function getGlobal(c: HonoContext) {
  return { origin: c.get('origin'), session: createBilinovelSession() };
}

const ensureSession = (ctx: Context<Workflow<string, Global>>) => {
  if (!ctx.global.session) {
    ctx.global.session = createBilinovelSession();
  }
};

const getTransformImgSrc = (ctx: Context<Workflow<string, Global>>) => (url: string) =>
  ctx.global.origin ? transformImgSrc(ctx.global.origin, url) : url;

export class WorkflowException extends Error {
  public readonly status: ContentfulStatusCode;

  public constructor(message: string, status: ContentfulStatusCode = 500, cause?: unknown) {
    super(message, { cause: cause instanceof WorkflowException ? cause.cause : cause });
    this.status = status;
  }

  public getMessage() {
    if (this.cause && (this.cause as Error)?.message) {
      return this.message + ': ' + (this.cause as Error).message;
    }
    return this.message;
  }
}

export const getNovel = workflow('getNovel', {
  concurrency: 1,
  cache: new LRUCache({
    max: 1000,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number) => `nid:${nid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid) => {
    const session = ctx.global.session;

    try {
      consola.log(`Start fetching novel page`, `nid:${nid}`);

      const resp = await fetchNovelPage(session.fetch, nid, {
        logger: consola,
        transformImgSrc: getTransformImgSrc(ctx)
      });

      if (resp) {
        consola.log(`Finish fetching novel page`, `nid:${nid}`, resp.name);

        ctx.run(updateNovel, nid);

        return { ...resp, fetchedAt: new Date() };
      } else {
        consola.error(`Failed fetching novel page`, `nid:${nid}`, 'due to 404 not found');

        throw new WorkflowException(`Failed fetching novel page nid:${nid}`, 404);
      }
    } catch (error) {
      consola.error(`Failed fetching novel page`, `nid:${nid}`, error);

      throw new WorkflowException(`Failed fetching novel page nid:${nid}`, 500, error);
    }
  });

export const getNovelVolume = workflow('getNovelVolume', {
  concurrency: 1,
  cache: new LRUCache({
    max: 1000,
    ttl: 24 * 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number, vid: number) => `nid:${nid}:vid:${vid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, vid) => {
    const session = ctx.global.session;

    try {
      consola.log(`Start fetching novel volume page`, `nid:${nid}`, `vid:${vid}`);

      const resp = await fetchNovelVolumePage(session.fetch, nid, vid, {
        logger: consola,
        transformImgSrc: getTransformImgSrc(ctx)
      });

      if (resp) {
        consola.log(`Finish fetching novel volume page`, `nid:${nid}`, `vid:${vid}`, resp.name);

        ctx.run(updateNovel, nid);

        return { ...resp, fetchedAt: new Date() };
      } else {
        consola.error(
          `Failed fetching novel volume page`,
          `nid:${nid}`,
          `vid:${vid}`,
          'due to 404 not found'
        );

        throw new WorkflowException(`Novel volume page nid:${nid} vid:${vid} is not found`, 404);
      }
    } catch (error) {
      consola.error(`Failed fetching novel volume page`, `nid:${nid}`, `vid:${vid}`, error);

      throw error;
    }
  });

export const getNovelChapter = workflow('getNovelChapter', {
  concurrency: 1,
  cache: new LRUCache({
    max: 1000,
    ttl: 24 * 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number, cid: number) => `nid:${nid}:cid:${cid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, cid) => {
    const session = ctx.global.session;

    try {
      consola.log(`Start fetching novel chapter page`, `nid:${nid}`, `cid:${cid}`);

      const resp = await fetchNovelChapterPages(session.fetch, nid, cid, {
        logger: consola,
        transformImgSrc: getTransformImgSrc(ctx),
        transformBbcode: true
      });

      if (resp) {
        consola.log(`Finish fetching novel chapter page`, `nid:${nid}`, `cid:${cid}`, resp?.title);

        ctx.run(updateNovel, nid);

        return { ...resp, fetchedAt: new Date() };
      } else {
        consola.error(
          `Failed fetching novel chapter page`,
          `nid:${nid}`,
          `cid:${cid}`,
          'due to 404 not found'
        );

        throw new WorkflowException(`Novel chapter page nid:${nid} cid:${cid} is not found`, 404);
      }
    } catch (error) {
      consola.error(`Failed fetching novel chapter page`, `nid:${nid}`, `cid:${cid}`, error);

      throw error;
    }
  });

export const updateNovel = workflow('updateNovel', { concurrency: 1 })
  .global<Global>()
  .input((nid: number) => `nid:${nid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid) => {
    try {
      const dbNovel = await getNovelFromDatabase('' + nid, false);
      if (
        dbNovel &&
        new Date().getTime() - dbNovel.fetchedAt.getTime() <=
          (dbNovel.done ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
      ) {
        consola.log(
          `Skip updating novel to database`,
          `nid:${nid}`,
          dbNovel.name,
          'updated:' + dbNovel.updatedAt.toLocaleString(),
          'fetched:' + dbNovel.fetchedAt.toLocaleString()
        );
        return dbNovel;
      }

      const novel = await ctx.run(getNovel, nid);

      ctx.set('novel', {
        nid,
        name: novel.name,
        updatedAt: novel.updatedAt,
        fetchedAt: novel.fetchedAt
      });
      ctx.set('progress', { current: 0, failed: 0, total: novel.volumes.length });

      consola.log(
        `Start updating novel to database`,
        `nid:${nid}`,
        novel.name,
        'updated:' + novel.updatedAt.toLocaleString()
      );

      let failed = 0;

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
          fetchedAt: novel.fetchedAt
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
            fetchedAt: novel.fetchedAt
          }
        });

      // 异步更新 foloId
      setFoloFeedId(new URL(`/bili/novel/${nid}/feed.xml`, ctx.global.origin));

      for (let i = 0; i < novel.volumes.length; i++) {
        const novelVolume = novel.volumes[i];

        ctx.set('volume', { vid: novelVolume.vid, title: novelVolume.title });
        ctx.set('progress', { current: i + 1, failed, total: novel.volumes.length });

        await tryResult(
          async () => await ctx.run(updateNovelVolume, nid, novelVolume.vid),
          () => (failed += 1)
        );
      }

      if (failed === 0) {
        await database.update(biliNovels).set({ done: true }).where(eq(biliNovels.nid, +nid));

        consola.log(
          `Finish updating novel to database`,
          `nid:${nid}`,
          novel.name,
          'updated:' + novel.updatedAt.toLocaleString()
        );

        return novel;
      } else {
        consola.log(
          `Failed updating novel to database`,
          `nid:${nid}`,
          novel.name,
          'updated:' + novel.updatedAt.toLocaleString()
        );

        return novel;
      }
    } catch (error) {
      consola.log(`Failed updating novel to database`, `nid:${nid}`, error);

      throw new WorkflowException(`Failed updating novel nid:${nid} to database`, 500, error);
    }
  });

export const updateNovelVolume = workflow('updateNovelVolume', { concurrency: 1 })
  .global<Global>()
  .input((nid: number, vid: number) => `nid:${nid}:vid:${vid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, vid) => {
    try {
      const novel = await ctx.run(getNovel, nid);
      const novelVolume = novel.volumes.find((volume) => volume.vid === vid);

      if (!novelVolume) {
        throw new WorkflowException(`Novel volume nid:${nid} vid:${vid} is not found`, 404);
      }

      consola.log(
        `Start updating novel volume to database`,
        `nid:${nid}`,
        novel.name,
        `vid:${vid}`,
        novelVolume.title
      );

      try {
        const fetchedVolume = await ctx.run(getNovelVolume, nid, vid);

        ctx.set('volume', {
          vid,
          name: fetchedVolume.name,
          updatedAt: fetchedVolume.updatedAt,
          fetchedAt: fetchedVolume.fetchedAt
        });
        ctx.set('progress', { current: 0, total: fetchedVolume.chapters.length });

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
            cover: fetchedVolume.cover,
            labels: fetchedVolume.labels,
            done: false,
            updatedAt: fetchedVolume.updatedAt,
            fetchedAt: fetchedVolume.fetchedAt
          })
          .onConflictDoUpdate({
            target: biliVolumes.vid,
            set: {
              name: novelVolume.title,
              volume: novelVolume.volume,
              description: fetchedVolume.description,
              cover: fetchedVolume.cover,
              done: false,
              updatedAt: fetchedVolume.updatedAt,
              fetchedAt: fetchedVolume.fetchedAt
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
            novelVolume.title,
            'updated:' + fetchedVolume.updatedAt.toLocaleString()
          );

          return fetchedVolume;
        }

        for (let index = 0; index < fetchedVolume.chapters.length; index++) {
          const fetchedVolumeChapter = fetchedVolume.chapters[index];
          const cid = fetchedVolumeChapter.cid;

          ctx.set('chapter', { cid, title: fetchedVolumeChapter.title });
          ctx.set('progress', { current: index + 1, total: fetchedVolume.chapters.length });

          const [oldChapter] = await database
            .select()
            .from(biliChapters)
            .where(eq(biliChapters.cid, +cid));

          // 视为数据一致: 数据库条目存在 且 数据库条目更新时间 >= 抓取的更新时间
          if (
            oldChapter &&
            oldChapter.updatedAt &&
            oldChapter.updatedAt.getTime() >= fetchedVolume.updatedAt.getTime()
          ) {
            consola.log(
              `Skip updating novel chapter to database`,
              `nid:${nid}`,
              novel.name,
              `vid:${vid}`,
              novelVolume.title,
              `cid:${cid}`,
              fetchedVolumeChapter.title
            );

            continue;
          }

          consola.log(
            `Start updating novel chapter to database`,
            `nid:${nid}`,
            novel.name,
            `vid:${vid}`,
            novelVolume.title,
            `cid:${fetchedVolumeChapter.cid}`,
            fetchedVolumeChapter.title,
            `(${index + 1} / ${fetchedVolume.chapters.length})`
          );

          try {
            const chapter = await ctx.run(getNovelChapter, nid, cid);

            await database
              .insert(biliChapters)
              .values({
                cid: fetchedVolumeChapter.cid,
                vid: novelVolume.vid,
                nid: +nid,
                title: fetchedVolumeChapter.title,
                content: chapter.content,
                images: chapter.images,
                index,
                updatedAt: fetchedVolume.updatedAt,
                fetchedAt: chapter.fetchedAt
              })
              .onConflictDoUpdate({
                target: biliChapters.cid,
                set: {
                  title: fetchedVolumeChapter.title,
                  content: chapter.content,
                  images: chapter.images,
                  index,
                  updatedAt: fetchedVolume.updatedAt,
                  fetchedAt: chapter.fetchedAt
                }
              });

            consola.log(
              `Finish updating novel chapter to database`,
              `nid:${nid}`,
              novel.name,
              `vid:${vid}`,
              novelVolume.title,
              `cid:${fetchedVolumeChapter.cid}`,
              fetchedVolumeChapter.title,
              `(${index + 1} / ${fetchedVolume.chapters.length})`
            );
          } catch (error) {
            consola.log(
              `Failed updating novel chapter to database`,
              `nid:${nid}`,
              novel.name,
              `vid:${vid}`,
              novelVolume.title,
              `cid:${fetchedVolumeChapter.cid}`,
              fetchedVolumeChapter.title,
              `(${index + 1} / ${fetchedVolume.chapters.length})`,
              error
            );

            throw new WorkflowException(`Failed updating novel chapter to database`, 500, error);
          }
        }

        await database.update(biliVolumes).set({ done: true }).where(eq(biliVolumes.vid, +vid));

        // 异步更新 foloId
        setFoloFeedId(new URL(`/bili/novel/${nid}/vol/${vid}/feed.xml`, ctx.global.origin));

        consola.log(
          `Finish updating novel volume and chapters to database`,
          `nid:${nid}`,
          novel.name,
          `vid:${vid}`,
          novelVolume.title
        );

        return fetchedVolume;
      } catch (error) {
        consola.log(
          `Failed updating novel volume and chapters to database`,
          `nid:${nid}`,
          novel.name,
          `vid:${vid}`,
          novelVolume.title,
          error
        );

        throw new WorkflowException(
          `Failed updating novel volume and chapters to database`,
          500,
          error
        );
      }
    } catch (error) {
      consola.log(`Failed updating novel volume to database`, `nid:${nid}`, `vid:${vid}`, error);

      throw new WorkflowException(`Failed updating novel volume to database`, 500, error);
    }
  });

export const updateNovelChapter = workflow('updateNovelChapter', { concurrency: 1 })
  .global<Global>()
  .input((nid: number, cid: number) => `nid:${nid}:cid:${cid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, cid) => {
    consola.log('Start updating novel chapter to database', `nid:${nid}`, `cid:${cid}`);

    try {
      const chapter = await ctx.run(getNovelChapter, nid, cid);
      const updated = await updateNovelChapterToDatabase(chapter);

      consola.log(
        'Finish updating novel chapter to database',
        `nid:${nid}`,
        `cid:${cid}`,
        chapter.title
      );

      return updated;
    } catch (error) {
      consola.log('Failed updating novel chapter to database', `nid:${nid}`, `cid:${cid}`, error);

      throw new WorkflowException(`Failed updating novel chapter to database`, 500, error);
    }
  });

export const getTop = workflow('getTop', {
  concurrency: indexLimit,
  cache: new LRUCache({
    max: 1000,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((filter: BilinovelFetchTopFilter) => getTopFilterKey(filter))
  .hook('pre:exec', ensureSession)
  .action(async (ctx, filter) => {
    const session = ctx.global.session;

    try {
      consola.log(`Start fetching top page`, filter);

      const resp = await fetchTopPage(session.fetch, filter, {
        logger: consola,
        transformImgSrc: getTransformImgSrc(ctx)
      });

      consola.log(
        `Finish fetching top page`,
        filter,
        resp.items.map((item) => ({ title: item.title, nid: item.nid }))
      );

      // 延迟更新所有 novel
      setTimeout(async () => {
        const items = [...resp.items].sort(
          (lhs, rhs) => rhs.updatedAt.getTime() - lhs.updatedAt.getTime()
        );
        for (const { nid } of items) {
          ctx.run(updateNovel, nid);
        }
      }, 1000);

      return resp;
    } catch (error) {
      consola.error(`Failed fetching top page`, filter, error);

      throw error;
    }
  });

export const getWenku = workflow('getWenku', {
  concurrency: indexLimit,
  cache: new LRUCache({
    max: 1000,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((filter: BilinovelFetchWenkuFilter) => getWenkuFilterKey(filter))
  .hook('pre:exec', ensureSession)
  .action(async (ctx, filter) => {
    const session = ctx.global.session;

    try {
      consola.log(`Start fetching wenku page`, filter);

      const resp = await fetchWenkuPage(session.fetch, filter, {
        logger: consola,
        transformImgSrc: getTransformImgSrc(ctx)
      });

      consola.log(
        `Finish fetching wenku page`,
        filter,
        resp.items.map((item) => ({ title: item.title, nid: item.nid }))
      );

      // 延迟更新所有 novel
      setTimeout(async () => {
        const items = [...resp.items].sort(
          (lhs, rhs) => rhs.updatedAt.getTime() - lhs.updatedAt.getTime()
        );
        for (const { nid } of items) {
          ctx.run(updateNovel, nid);
        }
      }, 1000);

      return resp;
    } catch (error) {
      consola.error(`Failed fetching wenku page`, filter, error);

      throw error;
    }
  });

function getWenkuFilterKey(filter: BilinovelFetchWenkuFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'wenku:' + entries.sort().join('&');
}

function getTopFilterKey(filter: BilinovelFetchTopFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'top:' + entries.sort().join('&');
}
