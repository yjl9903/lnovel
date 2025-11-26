import type { BrowserContext } from 'playwright';

import type { BilinovelFetchOptions } from './types';

export async function fetchNovelPage(
  context: BrowserContext,
  id: number,
  options?: BilinovelFetchOptions
) {
  const page = await context.newPage();
  const novelURL = new URL(`/novel/${id}.html`, options?.baseURL || 'https://www.linovelib.com/');

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
      const vid = vidMatch ? +vidMatch[1] : '';

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
    volumes: vols.filter((v) => v.vid && v.title && v.cover && v.volume)
  };
}
