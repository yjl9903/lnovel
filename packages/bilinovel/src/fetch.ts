import type { BrowserContext } from 'playwright';

import type { BilinovelFetchOptions } from './types';

import { sleep } from './utils';

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

export interface NovelChaptersResult {}

export async function fetchNovelPage(
  context: BrowserContext,
  nid: number,
  options?: BilinovelFetchOptions
): Promise<NovelPageResult | undefined> {
  if (!nid) return undefined;

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
  if (!nid || !vid) return undefined;

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

export async function fetchNovelChapters(
  context: BrowserContext,
  nid: number,
  cid: number,
  options?: BilinovelFetchOptions & { delay?: number }
) {
  if (!nid || !cid) return undefined;

  const page = await context.newPage();

  const results = [];

  let title = '';
  let pageCount = 1;

  for (; ; pageCount++) {
    const novelURL = new URL(
      `/novel/${nid}/${cid}${pageCount > 1 ? `_${pageCount}` : ''}.html`,
      options?.baseURL || 'https://www.linovelib.com/'
    );

    await page.goto(novelURL.toString());

    const rawTitle = await page.locator('#mlfy_main_text > h1').textContent();
    if (!rawTitle) break;
    const { title: currentTitle, current, total } = parseTitle(rawTitle);
    if (!currentTitle || current > total) break;

    title = currentTitle;

    const content = await page
      .locator('#mlfy_main_text > #TextContent')
      .first()
      .evaluate<string>((container) => {
        try {
          return [...container.childNodes].reduce((acc, dom) => {
            if (dom.nodeType === 8) return acc;
            if (dom.nodeType === 3) return acc + dom.textContent.trim();
            if (dom.nodeType === 1) {
              if (dom.getAttribute('class')?.includes('google')) return acc;
              if (dom.getAttribute('class')?.includes('dag')) return acc;
              if (dom.getAttribute('id')?.includes('hidden-images')) return acc;
              if (dom.getAttribute('id')?.includes('show-more-images')) return acc;
              if (dom.nodeName === 'P') return acc + `<p>${dom.innerHTML}</p>`;
              if (dom.nodeName === 'IMG') {
                const cloned = dom.cloneNode();
                cloned.removeAttribute('class');
                const realSrc = cloned.getAttribute('data-src');
                if (realSrc) {
                  cloned.removeAttribute('data-src');
                  cloned.setAttribute('src', realSrc);
                }
                return acc + cloned.outerHTML;
              }
              return acc + dom.outerHTML;
            }
            return acc;
          }, '');
        } catch (error) {
          return '';
        }
      });

    if (!content.trim()) break;

    results.push(content);

    const pagination = await page.locator('.mlfy_page > a:last-child').getAttribute('href');

    if (!pagination) break;
    if (!pagination.startsWith(`/novel/${nid}/${cid}_`)) break;

    if (current === total) break;

    const delay = options?.delay || 1000;
    await sleep(delay / 2 + (Math.random() * delay) / 2);
  }

  return {
    title,
    content: results.join('')
  };

  function parseTitle(input: string) {
    // 正则含义：
    // ^(.*?)   -> 捕获名称（非贪婪匹配）
    // （       -> 中文左括号
    // (\d+)    -> 捕获第一个数字
    // \/       -> 斜杠
    // (\d+)    -> 捕获第二个数字
    // ）$      -> 中文右括号结尾
    const regex = /^(.*?)（(\d+)\/(\d+)）$/;

    const match = input.match(regex);

    if (match) {
      // 命中正则，说明有括号
      return {
        title: match[1].trim(), // 去掉可能的尾部空格
        current: parseInt(match[2], 10),
        total: parseInt(match[3], 10)
      };
    } else {
      // 未命中正则，说明没有括号，或者是纯文本
      return {
        title: input.trim(),
        current: 1,
        total: Number.MAX_SAFE_INTEGER
      };
    }
  }
}
