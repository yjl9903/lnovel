import type { BrowserContext } from 'playwright';

import type { BilinovelFetchOptions } from './types';

export interface NovelPageResult {
  name: string;
  labels: string[];
  description: string;
  cover: string | null;
  volumes: Array<{
    vid: number;
    title: string;
    cover: string;
    volume: string;
  }>;
}

export interface NovelVolumePageResult {
  name: string;
  labels: string[];
  description: string;
  cover: string | null;
  chapters: Array<{ cid: number; title: string }>;
}

export async function fetchNovelPage(
  context: BrowserContext,
  nid: number,
  options?: BilinovelFetchOptions
): Promise<NovelPageResult | undefined> {
  const page = await context.newPage();
  const novelURL = new URL(`/novel/${nid}.html`, options?.baseURL || 'https://www.linovelib.com/');

  await page.goto(novelURL.toString());

  const name = await page.locator('.book-info > .book-name').first().textContent();

  if (!name) return undefined;

  const labels = await page.locator('.book-info > .book-label a').allTextContents();
  const description = await page
    .locator('.book-info > .book-dec > p:not(.backupname)')
    .first()
    .innerHTML();

  const cover = await page.locator('.book-img > img').first().getAttribute('src');

  const vols = await Promise.all(
    (await page.locator('.book-vol-chapter > a').all()).map(async (locator) => {
      const href = await locator.getAttribute('href');
      const title = await locator.getAttribute('title');
      const img = await locator.locator('.tit.fl').getAttribute('style');
      const volume = await locator.locator('h4').first().textContent();

      const vidMatch = href?.match(/vol_(\d+)\.html/);
      const vid = vidMatch ? +vidMatch[1] : 0;

      const imgMatch = img?.match(/url\(['"]?(.*?)['"]?\)/);
      const cover = imgMatch ? imgMatch[1] : '';

      return {
        vid,
        title,
        cover,
        volume
      };
    })
  );

  return {
    name,
    labels,
    description,
    cover,
    volumes: vols
      .filter((v) => v.vid && v.title && v.cover && v.volume)
      .sort((lhs, rhs) => lhs.vid - rhs.vid) as any
  };
}

export async function fetchNovelVolumePage(
  context: BrowserContext,
  nid: number,
  vid: number,
  options?: BilinovelFetchOptions
): Promise<NovelVolumePageResult | undefined> {
  const page = await context.newPage();
  const novelURL = new URL(
    `/novel/${nid}/vol_${vid}.html`,
    options?.baseURL || 'https://www.linovelib.com/'
  );

  await page.goto(novelURL.toString());

  const name = await page.locator('.book-info > .book-name').first().textContent();

  if (!name) return undefined;

  const labels = await page.locator('.book-info > .book-label a').allTextContents();
  const description = await page
    .locator('.book-info > .book-dec > p:not(.backupname)')
    .first()
    .innerHTML();

  const cover = await page.locator('.book-img > img').first().getAttribute('src');

  const chapters = await Promise.all(
    (await page.locator('.book-new-chapter > .tit > a').all()).map(async (locator) => {
      const title = await locator.textContent();
      const href = await locator.getAttribute('href');
      const cidMatch = href?.match(/\/(\d+)\.html$/);
      const cid = cidMatch ? +cidMatch[1] : 0;
      return {
        cid,
        title
      };
    })
  );

  return {
    name,
    labels,
    description,
    cover,
    chapters: chapters.filter((c) => c.cid && c.title) as any
  };
}
