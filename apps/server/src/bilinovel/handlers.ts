import { LRUCache } from 'lru-cache';

import { fetchNovelChapters, fetchNovelPage, fetchNovelVolumePage } from 'bilinovel';

import type { Context } from '../app';

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

export async function getNovel(c: Context, nid: string) {
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
}

export async function getNovelVolume(c: Context, nid: string, vid: string) {
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
}

export async function getNovelChapter(c: Context, nid: string, cid: string) {
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
}
