import type { BrowserContext, Page } from 'playwright';

import type {
  BilinovelFetchNovelOptions,
  BilinovelFetchNovelVolumeOptions,
  BilinovelFetchChapterOptions
} from './types';

import { blockRoutes, isCloudflarePage } from './browser';
import { applyTransformImgSrc, parseShanghaiDateTime, sleep } from './utils';

export interface NovelPageResult {
  nid: number;
  name: string;
  labels: string[];
  description: string;
  cover: string | undefined;
  updatedAt: Date;
  volumes: Array<{
    vid: number;
    title: string;
    cover: string;
    volume: string;
  }>;
}

export interface NovelVolumePageResult {
  vid: number;
  name: string;
  labels: string[];
  description: string;
  cover: string | undefined;
  updatedAt: Date;
  chapters: Array<{ cid: number; title: string }>;
}

export interface NovelChaptersResult {}

export async function fetchNovelPage(
  context: BrowserContext,
  nid: number,
  options?: BilinovelFetchNovelOptions
): Promise<NovelPageResult | undefined> {
  if (!nid) return undefined;

  const page = await context.newPage();
  const novelURL = new URL(`/novel/${nid}.html`, options?.baseURL || 'https://www.linovelib.com/');

  await page.goto(novelURL.toString());

  if (await isCloudflarePage(page)) {
    throw new Error('blocked by cloudflare');
  }

  const name = await page.locator('.book-info > .book-name').first().textContent();

  const updatedAtStr = await page
    .locator('meta[property="og:novel:update_time"]')
    .first()
    .getAttribute('content');
  const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : null;

  if (!name || !updatedAt) return undefined;

  const labels = await page.locator('.book-info > .book-label a').allTextContents();
  const description = await page
    .locator('.book-info > .book-dec > p:not(.backupname)')
    .first()
    .innerHTML();

  let cover = (await page.locator('.book-img > img').first().getAttribute('src')) || undefined;

  if (cover && options?.transformImgSrc) {
    cover = applyTransformImgSrc(cover, options.transformImgSrc);
  }

  const vols = await Promise.all(
    (await page.locator('.book-vol-chapter > a').all()).map(async (locator) => {
      const href = await locator.getAttribute('href');
      const title = await locator.getAttribute('title');
      const img = await locator.locator('.tit.fl').getAttribute('style');
      const volume = await locator.locator('h4').first().textContent();

      const vidMatch = href?.match(/vol_(\d+)\.html/);
      const vid = vidMatch ? +vidMatch[1] : 0;

      const imgMatch = img?.match(/url\(['"]?(.*?)['"]?\)/);
      let cover = imgMatch ? imgMatch[1] : '';

      if (cover) {
        cover = applyTransformImgSrc(cover, options?.transformImgSrc);
      }

      return {
        vid,
        title,
        cover,
        volume
      };
    })
  );

  return {
    nid: nid,
    name,
    labels,
    description,
    cover,
    updatedAt,
    volumes: vols
      .filter((v) => v.vid && v.title && v.cover && v.volume)
      .sort((lhs, rhs) => lhs.vid - rhs.vid) as any
  };
}

export async function fetchNovelVolumePage(
  context: BrowserContext,
  nid: number,
  vid: number,
  options?: BilinovelFetchNovelVolumeOptions
): Promise<NovelVolumePageResult | undefined> {
  if (!nid || !vid) return undefined;

  const page = await context.newPage();
  const novelURL = new URL(
    `/novel/${nid}/vol_${vid}.html`,
    options?.baseURL || 'https://www.linovelib.com/'
  );

  await blockRoutes(page);

  await page.goto(novelURL.toString());

  if (await isCloudflarePage(page)) {
    throw new Error('blocked by cloudflare');
  }

  const name = await page.locator('.book-info > .book-name').first().textContent();

  const updatedAtStr = await page
    .locator('meta[property="og:novel:update_time"]')
    .first()
    .getAttribute('content');
  const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : null;

  if (!name || !updatedAt) throw new Error(`missing info`);

  const labels = await page.locator('.book-info > .book-label a').allTextContents();
  const description = await page
    .locator('.book-info > .book-dec > p:not(.backupname)')
    .first()
    .innerHTML();

  let cover = (await page.locator('.book-img > img').first().getAttribute('src')) || undefined;

  if (cover && options?.transformImgSrc) {
    cover = applyTransformImgSrc(cover, options.transformImgSrc);
  }

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
    vid,
    name,
    labels,
    description,
    cover,
    updatedAt,
    chapters: chapters.filter((c) => c.cid && c.title) as any
  };
}

/**
 * @param context 需要禁用 JavaScript 执行, javaScriptEnabled: false
 * @param nid
 * @param cid
 * @param options
 * @returns
 */
export async function fetchNovelChapters(
  context: BrowserContext,
  nid: number,
  cid: number,
  options?: BilinovelFetchChapterOptions
) {
  if (!nid || !cid) return undefined;

  const page = await context.newPage();

  await blockRoutes(page);

  const contents = [];
  const images = [];

  let title = '';
  let pageCount = 1;

  for (; ; pageCount++) {
    const result = await fetchNovelChapterPage(page, nid, cid, pageCount, options);

    if (!result) break;

    title = result.title;
    contents.push(result.content);
    images.push(...result.images);

    if (result.pagination.complete) break;

    const delay = options?.delay || 1000;
    await sleep(delay / 2 + (Math.random() * delay) / 2);
  }

  return {
    title,
    content: contents.join(''),
    images
  };
}

export async function fetchNovelChapterPage(
  page: Page,
  nid: number,
  cid: number,
  pageCount: number,
  options?: BilinovelFetchChapterOptions
) {
  const novelURL = new URL(
    `/novel/${nid}/${cid}${pageCount > 1 ? `_${pageCount}` : ''}.html`,
    options?.baseURL || 'https://www.linovelib.com/'
  );

  await page.goto(novelURL.toString());

  if (await isCloudflarePage(page)) {
    throw new Error('blocked by cloudflare');
  }

  const rawTitle = await page.locator('#mlfy_main_text > h1').textContent();
  if (!rawTitle) return undefined;

  const { title, current, total } = parseTitle(rawTitle);
  if (!title || current > total) return undefined;

  let content = await page
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
            if (dom.nodeName === 'BR') return acc + '<br/>';
            if (dom.nodeName === 'P') {
              // @ts-ignore
              const style = getComputedStyle(dom);
              const position = style.getPropertyValue('position');
              return acc + (position === 'static' ? `<p>${dom.innerHTML}</p>` : '');
            }
            if (dom.nodeName === 'IMG') {
              const cloned = dom.cloneNode();
              cloned.removeAttribute('class');
              const realSrc = cloned.getAttribute('data-src');
              if (realSrc) {
                cloned.removeAttribute('data-src');
                cloned.setAttribute('src', realSrc);
              }
              return acc + cloned.outerHTML.replace(/>$/, '/>');
            }
            return acc + dom.outerHTML;
          }
          return acc;
        }, '');
      } catch (error) {
        return '';
      }
    });

  content = content.trim();

  if (!content) return undefined;

  if (options?.transformRuby) {
    content = transformRubyTags(content);
  }

  let images = await Promise.all(
    (await page.locator('#mlfy_main_text > #TextContent img').all()).map(async (locator) => {
      const src = (await locator.getAttribute('data-src')) || (await locator.getAttribute('src'));
      const alt = await locator.getAttribute('alt');

      return {
        src: src || undefined,
        alt: alt || undefined
      } as { src: string; alt: string | undefined };
    })
  );
  images = images.filter((img) => img.src);

  if (options?.transformImgSrc) {
    const rewriteContentImgSrc = (html: string) =>
      html.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (match, src) => {
        const next = applyTransformImgSrc(src, options.transformImgSrc);
        if (!next || next === src) return match;
        return match.replace(src, next);
      });

    images = images.map((img) => ({
      ...img,
      src: applyTransformImgSrc(img.src, options.transformImgSrc)
    }));
    content = rewriteContentImgSrc(content);
  }

  const pagination = await page.locator('.mlfy_page > a:last-child').getAttribute('href');
  const complete =
    (current > 1 && current === total) ||
    !pagination ||
    !pagination.startsWith(`/novel/${nid}/${cid}_`);

  return {
    cid,
    title,
    content,
    images,
    pagination: {
      current,
      total,
      complete
    }
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

  /**
   * 将自定义的 ruby 标签转换为标准 HTML
   * 输入格式: [ruby=reading]text[/ruby]
   * 输出格式: <ruby>text<rt>reading</rt></ruby>
   *
   * @param content 包含自定义 ruby 标签的原始字符串
   * @returns 转换后的 HTML 字符串
   */
  function transformRubyTags(content: string): string {
    // 正则表达式解释：
    // \[ruby=    : 匹配字面量 "[ruby="
    // ([^\]]+)   : 捕获组 1 (读音/注音)，匹配除了 "]" 以外的任意字符
    // \]         : 匹配字面量 "]"
    // (.*?)      : 捕获组 2 (正文)，非贪婪匹配任意字符
    // \[\/ruby\] : 匹配字面量 "[/ruby]"
    // g          : 全局匹配
    const regex = /\[ruby=([^\]]+)\](.*?)\[\/ruby\]/g;

    return content.replace(regex, (match, reading, baseText) => {
      // 构造标准 HTML5 ruby 结构
      // <ruby> 汉字 <rt> 注音 </rt> </ruby>
      return `<ruby>${baseText}<rt>${reading}</rt></ruby>`;
    });
  }
}
