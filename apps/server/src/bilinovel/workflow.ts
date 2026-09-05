import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { createEngine, workflow, newQueue, Context, Workflow } from 'flomise';

import {
  BilinovelError,
  BilinovelErrorCode,
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
import { consoleLogger, runTask, scheduleTask } from '../logging';

import { logger, transformImgSrc, tryResult } from './utils';
import { type Session, createBilinovelSession } from './browser';
import {
  getNovelFromDatabase,
  markNovelAsDeletedInDatabase,
  updateNovelChapterToDatabase
} from './database';

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
    max: 100,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number) => `nid:${nid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid },
      async () => {
        const session = ctx.global.session;

        try {
          logger.info(`Start fetching novel page`, {
            event: 'start.fetching.novel.page',
            novel_id: nid
          });

          const resp = await fetchNovelPage(session.fetch, nid, {
            logger: consoleLogger(logger),
            transformImgSrc: getTransformImgSrc(ctx)
          });

          if (resp) {
            logger.info(`Finish fetching novel page`, {
              event: 'finish.fetching.novel.page',
              novel_id: nid,
              name: resp.name
            });

            return { ...resp, fetchedAt: new Date() };
          } else {
            logger.error(`Failed fetching novel page`, {
              event: 'failed.fetching.novel.page',
              novel_id: nid,
              reason: 'due to 404 not found'
            });

            throw new WorkflowException(`Failed fetching novel page nid:${nid}`, 404);
          }
        } catch (error) {
          logger.error(
            `Failed fetching novel page`,
            { event: 'failed.fetching.novel.page', novel_id: nid },
            error
          );

          if (error instanceof BilinovelError && error.code === BilinovelErrorCode.banned) {
            const marked = await markNovelAsDeletedInDatabase(nid);
            logger.warn(
              marked ? `Marked novel as deleted` : `Unable to mark missing novel as deleted`,
              { novel_id: nid }
            );
          }

          throw new WorkflowException(`Failed fetching novel page nid:${nid}`, 500, error);
        }
      }
    )
  );

export const getNovelVolume = workflow('getNovelVolume', {
  concurrency: 1,
  cache: new LRUCache({
    max: 100,
    ttl: 24 * 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number, vid: number) => `nid:${nid}:vid:${vid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, vid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid, volume_id: vid },
      async () => {
        const session = ctx.global.session;

        try {
          logger.info(`Start fetching novel volume page`, {
            event: 'start.fetching.novel.volume.page',
            novel_id: nid,
            volume_id: vid
          });

          const resp = await fetchNovelVolumePage(session.fetch, nid, vid, {
            logger: consoleLogger(logger),
            transformImgSrc: getTransformImgSrc(ctx)
          });

          if (resp) {
            logger.info(`Finish fetching novel volume page`, {
              event: 'finish.fetching.novel.volume.page',
              novel_id: nid,
              volume_id: vid,
              name: resp.name
            });

            return { ...resp, fetchedAt: new Date() };
          } else {
            logger.error(`Failed fetching novel volume page`, {
              event: 'failed.fetching.novel.volume.page',
              novel_id: nid,
              volume_id: vid,
              reason: 'due to 404 not found'
            });

            throw new WorkflowException(
              `Novel volume page nid:${nid} vid:${vid} is not found`,
              404
            );
          }
        } catch (error) {
          logger.error(
            `Failed fetching novel volume page`,
            { event: 'failed.fetching.novel.volume.page', novel_id: nid, volume_id: vid },
            error
          );

          throw new WorkflowException(
            `Failed fetching novel volume page nid:${nid} vid:${vid}`,
            500,
            error
          );
        }
      }
    )
  );

export const getNovelChapter = workflow('getNovelChapter', {
  concurrency: 1,
  cache: new LRUCache({
    max: 100,
    ttl: 24 * 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((nid: number, cid: number) => `nid:${nid}:cid:${cid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, cid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid, chapter_id: cid },
      async () => {
        const session = ctx.global.session;

        try {
          logger.info(`Start fetching novel chapter page`, {
            event: 'start.fetching.novel.chapter.page',
            novel_id: nid,
            chapter_id: cid
          });

          const resp = await fetchNovelChapterPages(session.fetch, nid, cid, {
            logger: consoleLogger(logger),
            transformImgSrc: getTransformImgSrc(ctx),
            transformBbcode: true,
            hooks: {
              progress({ pagination }) {
                ctx.set('progress', { ...pagination });
              }
            }
          });

          if (resp) {
            logger.info(`Finish fetching novel chapter page`, {
              event: 'finish.fetching.novel.chapter.page',
              novel_id: nid,
              chapter_id: cid,
              title: resp?.title
            });

            return { ...resp, fetchedAt: new Date() };
          } else {
            logger.error(`Failed fetching novel chapter page`, {
              event: 'failed.fetching.novel.chapter.page',
              novel_id: nid,
              chapter_id: cid,
              reason: 'due to 404 not found'
            });

            throw new WorkflowException(
              `Novel chapter page nid:${nid} cid:${cid} is not found`,
              404
            );
          }
        } catch (error) {
          logger.error(
            `Failed fetching novel chapter page`,
            { event: 'failed.fetching.novel.chapter.page', novel_id: nid, chapter_id: cid },
            error
          );

          throw new WorkflowException(
            `Failed fetching novel chapter page nid:${nid} cid:${cid}`,
            500,
            error
          );
        }
      }
    )
  );

export const updateNovel = workflow('updateNovel', { concurrency: 1 })
  .global<Global>()
  .input((nid: number) => `nid:${nid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid },
      async () => {
        try {
          const dbNovel = await getNovelFromDatabase('' + nid, false);
          if (
            dbNovel &&
            !dbNovel.isDeleted &&
            new Date().getTime() - dbNovel.fetchedAt.getTime() <=
              (dbNovel.done ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
          ) {
            logger.info(`Skip updating novel to database`, {
              event: 'skip.updating.novel.to.database',
              novel_id: nid,
              novel_name: dbNovel.name,
              updated_at: dbNovel.updatedAt,
              fetched_at: dbNovel.fetchedAt
            });
            return dbNovel;
          }

          logger.info('Workflow requested', {
            event: 'workflow.requested',
            workflow: getNovel.scope,
            workflow_key: getNovel.key(nid),
            novel_id: nid
          });
          const novel = await ctx.run(getNovel, nid);

          ctx.set('novel', {
            nid,
            name: novel.name,
            updatedAt: novel.updatedAt,
            fetchedAt: novel.fetchedAt
          });
          ctx.set('progress', { current: 0, failed: 0, total: novel.volumes.length });

          logger.info(`Start updating novel to database`, {
            event: 'start.updating.novel.to.database',
            novel_id: nid,
            novel_name: novel.name,
            updated_at: novel.updatedAt
          });

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
              isDeleted: false,
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
                isDeleted: false
              }
            });

          // 异步更新 foloId
          void runTask('folo.update', { novel_id: nid }, () =>
            setFoloFeedId(new URL(`/bili/novel/${nid}/feed.xml`, ctx.global.origin))
          ).catch(() => {});

          for (let i = 0; i < novel.volumes.length; i++) {
            const novelVolume = novel.volumes[i];

            ctx.set('volume', { vid: novelVolume.vid, title: novelVolume.title });
            ctx.set('progress', { current: i + 1, failed, total: novel.volumes.length });

            logger.info('Workflow requested', {
              event: 'workflow.requested',
              workflow: updateNovelVolume.scope,
              workflow_key: updateNovelVolume.key(nid, novelVolume.vid),
              novel_id: nid,
              volume_id: novelVolume.vid
            });
            await tryResult(
              async () => await ctx.run(updateNovelVolume, nid, novelVolume.vid),
              () => (failed += 1)
            );
          }

          if (failed === 0) {
            await database
              .update(biliNovels)
              .set({ done: true, fetchedAt: novel.fetchedAt })
              .where(eq(biliNovels.nid, +nid));

            logger.info(`Finish updating novel to database`, {
              event: 'finish.updating.novel.to.database',
              novel_id: nid,
              novel_name: novel.name,
              updated_at: novel.updatedAt
            });

            return novel;
          } else {
            logger.error(`Failed updating novel to database`, {
              event: 'failed.updating.novel.to.database',
              novel_id: nid,
              novel_name: novel.name,
              updated_at: novel.updatedAt
            });

            return novel;
          }
        } catch (error) {
          logger.error(
            `Failed updating novel to database`,
            { event: 'failed.updating.novel.to.database', novel_id: nid },
            error
          );

          throw new WorkflowException(`Failed updating novel nid:${nid} to database`, 500, error);
        }
      }
    )
  );

export const updateNovelVolume = workflow('updateNovelVolume', { concurrency: 1 })
  .global<Global>()
  .input((nid: number, vid: number) => `nid:${nid}:vid:${vid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, vid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid, volume_id: vid },
      async () => {
        try {
          logger.info('Workflow requested', {
            event: 'workflow.requested',
            workflow: getNovel.scope,
            workflow_key: getNovel.key(nid),
            novel_id: nid
          });
          const novel = await ctx.run(getNovel, nid);
          const novelVolume = novel.volumes.find((volume) => volume.vid === vid);

          if (!novelVolume) {
            throw new WorkflowException(`Novel volume nid:${nid} vid:${vid} is not found`, 404);
          }

          logger.info(`Start updating novel volume to database`, {
            event: 'start.updating.novel.volume.to.database',
            novel_id: nid,
            novel_name: novel.name,
            volume_id: vid,
            volume_title: novelVolume.title
          });

          try {
            logger.info('Workflow requested', {
              event: 'workflow.requested',
              workflow: getNovelVolume.scope,
              workflow_key: getNovelVolume.key(nid, vid),
              novel_id: nid,
              volume_id: vid
            });
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
                  updatedAt: fetchedVolume.updatedAt
                }
              });

            // 异步更新 foloId
            void runTask('folo.update', { novel_id: nid, volume_id: vid }, () =>
              setFoloFeedId(new URL(`/bili/novel/${nid}/vol/${vid}/feed.xml`, ctx.global.origin))
            ).catch(() => {});

            // 视为数据一致: 数据库条目存在 且 数据库条目 done 且 数据库条目更新时间 >= 抓取的更新时间
            if (
              oldVolume &&
              oldVolume.done &&
              oldVolume.updatedAt.getTime() >= fetchedVolume.updatedAt.getTime()
            ) {
              await database
                .update(biliVolumes)
                .set({ done: true, fetchedAt: fetchedVolume.fetchedAt })
                .where(eq(biliVolumes.vid, +vid));

              logger.info(`Skip updating novel volume to database`, {
                event: 'skip.updating.novel.volume.to.database',
                novel_id: nid,
                novel_name: novel.name,
                volume_id: vid,
                volume_title: novelVolume.title,
                updated_at: fetchedVolume.updatedAt
              });

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
                logger.info(`Skip updating novel chapter to database`, {
                  event: 'skip.updating.novel.chapter.to.database',
                  novel_id: nid,
                  novel_name: novel.name,
                  volume_id: vid,
                  volume_title: novelVolume.title,
                  chapter_id: cid,
                  chapter_title: fetchedVolumeChapter.title
                });

                continue;
              }

              logger.info(`Start updating novel chapter to database`, {
                event: 'start.updating.novel.chapter.to.database',
                novel_id: nid,
                novel_name: novel.name,
                volume_id: vid,
                volume_title: novelVolume.title,
                chapter_id: fetchedVolumeChapter.cid,
                chapter_title: fetchedVolumeChapter.title,
                progress_current: index + 1,
                progress_total: fetchedVolume.chapters.length
              });

              try {
                logger.info('Workflow requested', {
                  event: 'workflow.requested',
                  workflow: getNovelChapter.scope,
                  workflow_key: getNovelChapter.key(nid, cid),
                  novel_id: nid,
                  chapter_id: cid
                });
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

                logger.info(`Finish updating novel chapter to database`, {
                  event: 'finish.updating.novel.chapter.to.database',
                  novel_id: nid,
                  novel_name: novel.name,
                  volume_id: vid,
                  volume_title: novelVolume.title,
                  chapter_id: fetchedVolumeChapter.cid,
                  chapter_title: fetchedVolumeChapter.title,
                  progress_current: index + 1,
                  progress_total: fetchedVolume.chapters.length
                });
              } catch (error) {
                logger.error(
                  `Failed updating novel chapter to database`,
                  {
                    event: 'failed.updating.novel.chapter.to.database',
                    novel_id: nid,
                    novel_name: novel.name,
                    volume_id: vid,
                    volume_title: novelVolume.title,
                    chapter_id: fetchedVolumeChapter.cid,
                    chapter_title: fetchedVolumeChapter.title,
                    progress_current: index + 1,
                    progress_total: fetchedVolume.chapters.length
                  },
                  error
                );

                throw new WorkflowException(
                  `Failed updating novel chapter to database`,
                  500,
                  error
                );
              }
            }

            await database.update(biliVolumes).set({ done: true }).where(eq(biliVolumes.vid, +vid));

            logger.info(`Finish updating novel volume and chapters to database`, {
              event: 'finish.updating.novel.volume.and.chapters.to.database',
              novel_id: nid,
              novel_name: novel.name,
              volume_id: vid,
              volume_title: novelVolume.title
            });

            return fetchedVolume;
          } catch (error) {
            logger.error(
              `Failed updating novel volume and chapters to database`,
              {
                event: 'failed.updating.novel.volume.and.chapters.to.database',
                novel_id: nid,
                novel_name: novel.name,
                volume_id: vid,
                volume_title: novelVolume.title
              },
              error
            );

            throw new WorkflowException(
              `Failed updating novel volume and chapters to database`,
              500,
              error
            );
          }
        } catch (error) {
          logger.error(
            `Failed updating novel volume to database`,
            { event: 'failed.updating.novel.volume.to.database', novel_id: nid, volume_id: vid },
            error
          );

          throw new WorkflowException(`Failed updating novel volume to database`, 500, error);
        }
      }
    )
  );

export const updateNovelChapter = workflow('updateNovelChapter', { concurrency: 1 })
  .global<Global>()
  .input((nid: number, cid: number) => `nid:${nid}:cid:${cid}`)
  .hook('pre:exec', ensureSession)
  .action(async (ctx, nid, cid) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, novel_id: nid, chapter_id: cid },
      async () => {
        logger.info('Start updating novel chapter to database', {
          event: 'start.updating.novel.chapter.to.database',
          novel_id: nid,
          chapter_id: cid
        });

        try {
          logger.info('Workflow requested', {
            event: 'workflow.requested',
            workflow: getNovelChapter.scope,
            workflow_key: getNovelChapter.key(nid, cid),
            novel_id: nid,
            chapter_id: cid
          });
          const chapter = await ctx.run(getNovelChapter, nid, cid);
          const updated = await updateNovelChapterToDatabase(chapter);

          logger.info('Finish updating novel chapter to database', {
            event: 'finish.updating.novel.chapter.to.database',
            novel_id: nid,
            chapter_id: cid,
            chapter_title: chapter.title
          });

          return updated;
        } catch (error) {
          logger.error(
            'Failed updating novel chapter to database',
            { event: 'failed.updating.novel.chapter.to.database', novel_id: nid, chapter_id: cid },
            error
          );

          throw new WorkflowException(`Failed updating novel chapter to database`, 500, error);
        }
      }
    )
  );

export const getTop = workflow('getTop', {
  concurrency: indexLimit,
  cache: new LRUCache({
    max: 5,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((filter: BilinovelFetchTopFilter) => getTopFilterKey(filter))
  .hook('pre:exec', ensureSession)
  .action(async (ctx, filter) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, filter: filter },
      async () => {
        const session = ctx.global.session;

        try {
          logger.info(`Start fetching top page`, {
            event: 'start.fetching.top.page',
            filter: filter
          });

          const resp = await fetchTopPage(session.fetch, filter, {
            logger: consoleLogger(logger),
            transformImgSrc: getTransformImgSrc(ctx)
          });

          logger.info(`Finish fetching top page`, {
            event: 'finish.fetching.top.page',
            filter: filter,
            novel_ids: resp.items.map((item) => item.nid),
            count: resp.items.length
          });

          // 延迟更新所有 novel
          scheduleTask(
            'novels.refresh',
            {},
            async () => {
              const items = [...resp.items].sort(
                (lhs, rhs) => rhs.updatedAt.getTime() - lhs.updatedAt.getTime()
              );
              for (const { nid } of items) {
                logger.info('Workflow requested', {
                  event: 'workflow.requested',
                  workflow: updateNovel.scope,
                  workflow_key: updateNovel.key(nid),
                  novel_id: nid,
                  background: true
                });
                runTask(
                  'workflow.background',
                  { workflow: updateNovel.scope, workflow_key: updateNovel.key(nid) },
                  () => ctx.run(updateNovel, nid)
                ).catch(() => {});
              }
            },
            1000
          );

          return resp;
        } catch (error) {
          logger.error(
            `Failed fetching top page`,
            { event: 'failed.fetching.top.page', filter: filter },
            error
          );

          throw error;
        }
      }
    )
  );

export const getWenku = workflow('getWenku', {
  concurrency: indexLimit,
  cache: new LRUCache({
    max: 5,
    ttl: 60 * 60 * 1000
  })
})
  .global<Global>()
  .input((filter: BilinovelFetchWenkuFilter) => getWenkuFilterKey(filter))
  .hook('pre:exec', ensureSession)
  .action(async (ctx, filter) =>
    runTask(
      ctx.workflow.scope,
      { workflow: ctx.workflow.scope, workflow_key: ctx.key, filter: filter },
      async () => {
        const session = ctx.global.session;

        try {
          logger.info(`Start fetching wenku page`, {
            event: 'start.fetching.wenku.page',
            filter: filter
          });

          const resp = await fetchWenkuPage(session.fetch, filter, {
            logger: consoleLogger(logger),
            transformImgSrc: getTransformImgSrc(ctx)
          });

          logger.info(`Finish fetching wenku page`, {
            event: 'finish.fetching.wenku.page',
            filter: filter,
            novel_ids: resp.items.map((item) => item.nid),
            count: resp.items.length
          });

          // 延迟更新所有 novel
          scheduleTask(
            'novels.refresh',
            {},
            async () => {
              const items = [...resp.items].sort(
                (lhs, rhs) => rhs.updatedAt.getTime() - lhs.updatedAt.getTime()
              );
              for (const { nid } of items) {
                logger.info('Workflow requested', {
                  event: 'workflow.requested',
                  workflow: updateNovel.scope,
                  workflow_key: updateNovel.key(nid),
                  novel_id: nid,
                  background: true
                });
                runTask(
                  'workflow.background',
                  { workflow: updateNovel.scope, workflow_key: updateNovel.key(nid) },
                  () => ctx.run(updateNovel, nid)
                ).catch(() => {});
              }
            },
            1000
          );

          return resp;
        } catch (error) {
          logger.error(
            `Failed fetching wenku page`,
            { event: 'failed.fetching.wenku.page', filter: filter },
            error
          );

          throw error;
        }
      }
    )
  );

function getWenkuFilterKey(filter: BilinovelFetchWenkuFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'wenku:' + entries.sort().join('&');
}

function getTopFilterKey(filter: BilinovelFetchTopFilter) {
  const entries = Object.entries(filter).map(([k, v]) => `${k}=${v}`);
  return 'top:' + entries.sort().join('&');
}
