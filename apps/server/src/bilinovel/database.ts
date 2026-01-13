import { and, asc, eq, ne } from 'drizzle-orm';

import {
  type NovelPageResult,
  type NovelVolumePageResult,
  type NovelChaptersResult
} from 'bilinovel';

import { database } from '../database';
import { biliChapters, biliNovels, biliVolumes } from '../schema';

export const getNovelFromDatabase = async (nid: string): Promise<NovelPageResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel) {
    const volumes = await database
      .select()
      .from(biliVolumes)
      .where(eq(biliVolumes.nid, +nid))
      .orderBy(biliVolumes.vid);

    return {
      nid: novel.nid,
      name: novel.name,
      authors: novel.authors || [],
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

export const getNovelsFromDatabase = async ({ done }: { done?: boolean } = {}) => {
  const novels = await database
    .select()
    .from(biliNovels)
    .where(done === true || done === false ? eq(biliNovels.done, done) : undefined)
    .orderBy(biliNovels.nid);

  return novels.map((novel) => {
    return {
      nid: novel.nid,
      name: novel.name,
      authors: novel.authors,
      description: novel.description,
      cover: novel.cover || undefined,
      labels: novel.labels || [],
      updatedAt: novel.updatedAt,
      fetchedAt: novel.fetchedAt,
      done: novel.done
    };
  });
};

export const getNovelVolumeFromDatabase = async (
  nid: string,
  vid: string
): Promise<NovelVolumePageResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel) {
    const [volume] = await database.select().from(biliVolumes).where(eq(biliVolumes.vid, +vid));

    if (volume) {
      const chapters = await database
        .select()
        .from(biliChapters)
        .where(eq(biliChapters.vid, +vid))
        .orderBy(asc(biliChapters.index), asc(biliChapters.cid));

      return {
        nid: volume.nid,
        vid: volume.vid,
        name: volume.name,
        authors: novel.authors,
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

export const getNovelChapterFromDatabase = async (
  nid: string,
  cid: string
): Promise<NovelChaptersResult | undefined> => {
  const [novel] = await database.select().from(biliNovels).where(eq(biliNovels.nid, +nid));

  if (novel) {
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

export const updateNovelChapterToDatabase = async (chapter: NovelChaptersResult) => {
  const resp = await database
    .update(biliChapters)
    .set({
      content: chapter.content,
      images: chapter.images,
      fetchedAt: new Date()
    })
    .where(and(eq(biliChapters.cid, chapter.cid), ne(biliChapters.content, chapter.content)))
    .returning({ cid: biliChapters.cid });

  return resp.length > 0;
};
