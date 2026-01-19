import type { BrowserContext, Page } from 'playwright';

import type {
  BilinovelFetchNovelOptions,
  BilinovelFetchNovelVolumeOptions,
  BilinovelFetchChapterOptions
} from './types';

import { blockRoutes, isCloudflarePage } from './browser';
import { BilinovelError, CloudflareError } from './error';
import { applyTransformImgSrc, parseShanghaiDateTime, sleep } from './utils';

export interface NovelPageResult {
  nid: number;
  name: string;
  authors: Array<AuthorResult>;
  labels: string[];
  description: string;
  cover: string | undefined;
  volumes: Array<{
    nid: number;
    vid: number;
    title: string;
    cover: string;
    volume: string;
  }>;
  updatedAt: Date;
  fetchedAt: Date;
}

export interface NovelVolumePageResult {
  nid: number;
  vid: number;
  name: string;
  authors: Array<AuthorResult>;
  labels: string[];
  description: string;
  cover: string | undefined;
  chapters: Array<{ nid: number; vid: number; cid: number; title: string }>;
  updatedAt: Date;
  fetchedAt: Date;
}

export interface NovelChapterPagesResult {
  nid: number;
  cid: number;
  title: string;
  content: string;
  images: Array<{ src: string; alt: string | null | undefined }>;
  fetchedAt: Date;
}

export interface AuthorResult {
  name: string;
  position: string;
  avatar?: string;
}

export async function fetchNovelPage(
  context: BrowserContext,
  nid: number,
  options?: BilinovelFetchNovelOptions
): Promise<NovelPageResult | undefined> {
  if (!nid) return undefined;

  const page = await context.newPage();
  const novelURL = new URL(`/novel/${nid}.html`, options?.baseURL || 'https://www.linovelib.com/');

  try {
    await page.goto(novelURL.toString(), {
      waitUntil: 'domcontentloaded'
    });

    if (await isCloudflarePage(page)) {
      throw new CloudflareError(novelURL);
    }

    if (
      (await page.getByText('抱歉，作品已下架！').count()) > 0 ||
      (await page.getByText('小说下架了').count()) > 0
    ) {
      throw new BilinovelError(`This novel ${nid} has been taken down.`);
    }

    const name = await page.locator('.book-info > .book-name').first().textContent();

    const authors = await extractAuthors(page);

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

    let vols = await Promise.all(
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
          nid,
          vid,
          title,
          cover,
          volume
        };
      })
    );

    if (vols.length === 0) {
      await sleep(1000 + 1000 * Math.random());

      const catalogURL = new URL(
        `/novel/${nid}/catalog`,
        options?.baseURL || 'https://www.linovelib.com/'
      );

      await page.goto(catalogURL.toString(), {
        waitUntil: 'domcontentloaded'
      });

      if (await isCloudflarePage(page)) {
        throw new CloudflareError(catalogURL);
      }

      vols = await Promise.all(
        (await page.locator('.volume-list > .volume').all()).map(async (locator) => {
          const href = await locator.locator('a').first().getAttribute('href');
          const title = await locator.locator('h2').first().textContent();
          let cover = (await locator.locator('img').first().getAttribute('data-original')) || '';
          const volume = '';

          const vidMatch = href?.match(/vol_(\d+)\.html/);
          const vid = vidMatch ? +vidMatch[1] : 0;

          if (cover) {
            cover = applyTransformImgSrc(cover, options?.transformImgSrc);
          }

          return {
            nid,
            vid,
            title,
            cover,
            volume
          };
        })
      );
    }

    return {
      nid: nid,
      name,
      authors,
      labels,
      description,
      cover,
      volumes: vols
        .filter((v) => v.vid && v.title && v.cover)
        .sort((lhs, rhs) => lhs.vid - rhs.vid) as any,
      updatedAt,
      fetchedAt: new Date()
    };
  } catch (error) {
    if (!(error instanceof CloudflareError) && !(error instanceof BilinovelError)) {
      await options?.postmortem?.(page);
    }
    throw error;
  }
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

  try {
    await blockRoutes(page);

    await page.goto(novelURL.toString(), {
      waitUntil: 'domcontentloaded'
    });

    if (await isCloudflarePage(page)) {
      throw new CloudflareError(novelURL);
    }

    const name = await page.locator('.book-info > .book-name').first().textContent();

    const updatedAtStr = await page
      .locator('meta[property="og:novel:update_time"]')
      .first()
      .getAttribute('content');
    const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : null;

    if (!name || !updatedAt) throw new Error(`missing info`);

    const authors = await extractAuthors(page);

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
          nid,
          vid,
          cid,
          title
        };
      })
    );

    return {
      nid,
      vid,
      name,
      authors,
      labels,
      description,
      cover,
      chapters: chapters.filter((c) => c.cid && c.title) as any,
      updatedAt,
      fetchedAt: new Date()
    };
  } catch (error) {
    if (!(error instanceof CloudflareError) && !(error instanceof BilinovelError)) {
      await options?.postmortem?.(page);
    }
    throw error;
  }
}

async function extractAuthors(page: Page) {
  let authors = await page
    .locator('.book-author .au-name a')
    .evaluateAll<AuthorResult[]>((links: any[]) => {
      eval('var __name = t => t');

      const items: AuthorResult[] = [];

      const normalizePosition = (input: string) => {
        input = input.replace(/[()（）]/g, '').trim();
        if (input === '插画') return 'illustrator';
        return input;
      };
      const parsePositionFromHref = (href: string) => {
        if (href.includes('/illustratorarticle/')) return 'illustrator';
        if (href.includes('/authorarticle/')) return 'author';
        if (href.includes('/translatorarticle/')) return 'translator';
        return '';
      };
      const normalizeName = (input: string) => input.replace(/[()（）]/g, '').trim();

      for (const link of links) {
        const ruby = link.querySelector('ruby');
        const rt = ruby?.querySelector('rt');
        let position = rt?.textContent ? normalizePosition(rt.textContent) : '';
        if (!position) {
          const href = link.getAttribute('href') || '';
          position = parsePositionFromHref(href) || 'author';
        }

        let name = '';
        if (ruby) {
          const cloned = ruby.cloneNode(true);
          cloned.querySelectorAll('rt, rp').forEach((node: any) => node.remove());
          name = normalizeName(cloned.textContent || '');
        } else {
          name = normalizeName(link.textContent || '');
        }

        if (name) {
          items.push({ name, position });
        }
      }

      return items;
    });

  if (authors.length === 0) {
    const authorMeta =
      (await page.locator('meta[property="og:novel:author"]').first().getAttribute('content')) ||
      (await page.locator('meta[name="author"]').first().getAttribute('content')) ||
      '';
    const authorPositionFallback =
      (await page.locator('.book-author .au-head em').first().textContent()) || '';
    const authorRaw = authorMeta.trim();

    if (authorRaw) {
      const fallbackPosition = authorPositionFallback.trim() || 'author';
      authors = authorRaw
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => ({ name: item, position: fallbackPosition }));
    }
  }

  return authors;
}

export async function fetchNovelChapters(
  context: BrowserContext,
  nid: number,
  cid: number,
  options?: BilinovelFetchChapterOptions
): Promise<NovelChapterPagesResult | undefined> {
  if (!nid || !cid) return undefined;

  const page = await context.newPage();

  try {
    await blockRoutes(page);

    const contents = [];
    const images = [];

    let title = '';
    let pageCount = 1;

    for (; ; pageCount++) {
      if (pageCount > 1 && Math.random() <= 0.5) {
        const delay = options?.delay || 1000;
        await sleep(delay + Math.random() * delay);
      }

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
      nid,
      cid,
      title,
      content: contents.join(''),
      images,
      fetchedAt: new Date()
    };
  } catch (error) {
    if (!(error instanceof CloudflareError) && !(error instanceof BilinovelError)) {
      await options?.postmortem?.(page);
    }
    throw error;
  }
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

  await page.goto(novelURL.toString(), {
    waitUntil: 'domcontentloaded'
  });

  if (await isCloudflarePage(page)) {
    throw new CloudflareError(novelURL);
  }

  if ((await page.getByText('沒有可閱讀的章節').count()) > 0) {
    throw new BilinovelError(`This novel ${nid} and chapter ${cid} has been taken down.`);
  }

  const rawTitle = await page.locator('#mlfy_main_text > h1').textContent();
  if (!rawTitle) return undefined;

  const { title, current, total } = parseTitle(rawTitle);
  if (!title || current > total) return undefined;

  let content = await page
    .locator('#mlfy_main_text > #TextContent')
    .first()
    .evaluate<string>((container: any) => {
      try {
        // Under tsx / esbuild environment, all the functions will be wrapped by __name(<fn>, '<name>')
        // hacked by evalling a script to "polyfill" __name function
        eval('var __name = t => t');

        // @ts-ignore
        const getString = (dom) => {
          if (dom.nodeType === 8) return '';
          if (dom.nodeType === 3) return dom.textContent.trim();
          if (dom.nodeType === 1) {
            if (dom.getAttribute('class')?.includes('google')) return '';
            if (dom.getAttribute('class')?.includes('dag')) return '';
            if (dom.getAttribute('id')?.includes('hidden-images')) return '';
            if (dom.getAttribute('id')?.includes('show-more-images')) return '';
            if (dom.nodeName === 'BR') return '<br/>';
            if (dom.nodeName === 'P') {
              // @ts-ignore
              const style = window.getComputedStyle(dom);
              const position = style.getPropertyValue('position');
              return position === 'static' && dom.textContent.length > 0
                ? `<p>${dom.innerHTML}</p>`
                : '';
            }
            if (dom.nodeName === 'IMG') {
              const cloned = dom.cloneNode();
              cloned.removeAttribute('class');
              const realSrc = cloned.getAttribute('data-src');
              if (realSrc) {
                cloned.removeAttribute('data-src');
                cloned.setAttribute('src', realSrc);
              }
              return cloned.outerHTML.replace(/>$/, '/>');
            }
            if (dom.nodeName === 'SMALL' && dom.querySelector('p')) {
              return [...dom.childNodes].reduce((acc, dom) => acc + getString(dom), '');
            }
            return dom.outerHTML;
          }
          return '';
        };

        return [...container.childNodes].reduce((acc, dom) => {
          return acc + getString(dom);
        }, '');
      } catch (error) {
        // @ts-ignore
        return 'ERROR: ' + error?.message + '\n' + (error?.stack || '');
      }
    });

  content = content.trim();

  if (!content) return undefined;

  if (options?.transformBbcode) {
    content = transformBbcode(content);
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
   * 简单的 BBCode 转换为 HTML（包含 ruby 标签）
   * 例如:
   * [b]text[/b] -> <strong>text</strong>
   * [ruby=reading]text[/ruby] -> <ruby>text<rt>reading</rt></ruby>
   */
  function transformBbcode(content: string): string {
    // 一些常见标签的简易替换，非完整 BBCode 解析
    const tags: Record<string, string> = {
      b: 'strong',
      i: 'em',
      u: 'u',
      s: 's',
      sub: 'sub',
      sup: 'sup',
      quote: 'blockquote'
    };

    for (const [bbTag, htmlTag] of Object.entries(tags)) {
      const regex = new RegExp(`\\[${bbTag}\\]([\\s\\S]*?)\\[\\/${bbTag}\\]`, 'gi');
      content = content.replace(regex, `<${htmlTag}>$1</${htmlTag}>`);
    }

    // [url=https://example.com]text[/url]
    content = content.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, href, text) => {
      return `<a href="${href}">${text}</a>`;
    });

    // [img]src[/img]
    content = content.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, src) => {
      src = src.trim();
      if (options?.transformImgSrc) {
        src = applyTransformImgSrc(src, options.transformImgSrc);
      }
      return `<img src="${src}" />`;
    });

    // [ruby=reading]text[/ruby]
    content = content.replace(
      /\[ruby=([^\]]+)\]([\s\S]*?)\[\/ruby\]/gi,
      (_match, reading, text) => {
        return `<ruby>${text}<rt>${reading}</rt></ruby>`;
      }
    );

    return content;
  }
}
