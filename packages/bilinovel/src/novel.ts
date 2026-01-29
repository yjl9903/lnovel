import type {
  BilinovelFetch,
  BilinovelFetchNovelOptions,
  BilinovelFetchNovelVolumeOptions,
  BilinovelFetchNovelChapterOptions
} from './types';

import { BilinovelError } from './error';
import { createDocument, applyTransformImgSrc, parseShanghaiDateTime } from './utils';

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
}

export interface NovelChapterPagesResult {
  nid: number;
  cid: number;
  title: string;
  content: string;
  images: Array<{ src: string; alt: string | null | undefined }>;
}

export interface AuthorResult {
  name: string;
  position: string;
  avatar?: string;
}

export async function fetchNovelPage(
  fetch: BilinovelFetch,
  nid: number,
  options?: BilinovelFetchNovelOptions
): Promise<NovelPageResult | undefined> {
  const pathname = `/novel/${nid}.html`;
  const html = await fetch(pathname, { selector: '.wrap' });
  if (!html) return undefined;
  const document = createDocument(html);

  if (hasText(document, ['抱歉，作品已下架！', '小说下架了', '抱歉，该小说不存在！'])) {
    throw new BilinovelError(pathname, `This novel ${nid} has been taken down.`);
  }

  if (!document.querySelector('.book-info > .book-name')) {
    throw new BilinovelError(pathname);
  }

  const name = document.querySelector('.book-info > .book-name')?.textContent?.trim() || '';
  const updatedAtStr =
    document.querySelector('meta[property="og:novel:update_time"]')?.getAttribute('content') || '';
  const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : null;

  if (!name || !updatedAt) return undefined;

  const authors = extractAuthors(document);

  const labels = Array.from(document.querySelectorAll('.book-info > .book-label a'))
    .map((item) => item.textContent?.trim() || '')
    .filter(Boolean);
  const description =
    document.querySelector('.book-info > .book-dec > p:not(.backupname)')?.innerHTML || '';

  let cover = document.querySelector('.book-img > img')?.getAttribute('src') || undefined;

  if (cover && options?.transformImgSrc) {
    cover = applyTransformImgSrc(cover, options.transformImgSrc);
  }

  let vols = parseVolumesFromNovelDocument(document, nid, options?.transformImgSrc);

  if (vols.length === 0) {
    const catalogHtml = await fetch(`/novel/${nid}/catalog`, { selector: '.wrap' });
    if (!catalogHtml) return undefined;
    const catalogDocument = createDocument(catalogHtml);

    if (!catalogDocument.querySelector('.volume-list > .volume')) {
      throw new BilinovelError(`/novel/${nid}/catalog`);
    }

    vols = parseVolumesFromCatalogDocument(catalogDocument, nid, options?.transformImgSrc);
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
    updatedAt
  };
}

export async function fetchNovelVolumePage(
  fetch: BilinovelFetch,
  nid: number,
  vid: number,
  options?: BilinovelFetchNovelVolumeOptions
): Promise<NovelVolumePageResult | undefined> {
  const pathname = `/novel/${nid}/vol_${vid}.html`;
  const html = await fetch(pathname, { selector: '.wrap' });
  if (!html) return undefined;
  const document = createDocument(html);

  if (hasText(document, ['抱歉，作品已下架！', '小说下架了', '抱歉，该小说不存在！'])) {
    throw new BilinovelError(pathname, `This novel ${nid} volume ${vid} has been taken down.`);
  }

  if (!document.querySelector('.book-info > .book-name')) {
    throw new BilinovelError(pathname);
  }

  const name = document.querySelector('.book-info > .book-name')?.textContent?.trim() || '';

  const updatedAtStr =
    document.querySelector('meta[property="og:novel:update_time"]')?.getAttribute('content') || '';
  const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : null;

  if (!name || !updatedAt) throw new Error(`missing info`);

  const authors = extractAuthors(document);

  const labels = Array.from(document.querySelectorAll('.book-info > .book-label a'))
    .map((item) => item.textContent?.trim() || '')
    .filter(Boolean);
  const description =
    document.querySelector('.book-info > .book-dec > p:not(.backupname)')?.innerHTML || '';

  let cover = document.querySelector('.book-img > img')?.getAttribute('src') || undefined;

  if (cover && options?.transformImgSrc) {
    cover = applyTransformImgSrc(cover, options.transformImgSrc);
  }

  const chapters = Array.from(document.querySelectorAll('.book-new-chapter > .tit > a')).map(
    (element) => {
      const title = element.textContent?.trim() || '';
      const href = element.getAttribute('href');
      const cidMatch = href?.match(/\/(\d+)\.html$/);
      const cid = cidMatch ? +cidMatch[1] : 0;

      return {
        nid,
        vid,
        cid,
        title
      };
    }
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
    updatedAt
  };
}

export async function fetchNovelChapterPages(
  fetch: BilinovelFetch,
  nid: number,
  cid: number,
  options?: BilinovelFetchNovelChapterOptions
): Promise<NovelChapterPagesResult | undefined> {
  const contents = [];
  const images = [];
  let title = '';

  for (let pageCount = 1; ; pageCount++) {
    try {
      options?.logger?.log(
        `Start fetching novel chapter single page`,
        `nid:${nid}`,
        `cid:${cid}`,
        `page:${pageCount}`
      );

      const result = await fetchNovelChapterPage(fetch, nid, cid, pageCount, options);

      try {
        if (result) {
          await options?.hooks?.progress?.(result);
        }
      } catch {}

      options?.logger?.log(
        `Finish fetching novel chapter single page`,
        `nid:${nid}`,
        `cid:${cid}`,
        `page:${pageCount}${result?.pagination.total !== Number.MAX_SAFE_INTEGER ? ` / total:${result?.pagination.total || 0}` : ''}`
      );

      if (!result) break;

      title = result.title;
      contents.push(result.content);
      images.push(...result.images);

      if (result.pagination.complete) break;
    } catch (error) {
      options?.logger?.log(
        `Failed fetching novel chapter single page`,
        `nid:${nid}`,
        `cid:${cid}`,
        `page:${pageCount}`,
        error
      );

      throw error;
    }
  }

  return {
    nid,
    cid,
    title,
    content: contents.join(''),
    images
  };
}

export async function fetchNovelChapterPage(
  fetch: BilinovelFetch,
  nid: number,
  cid: number,
  pageCount: number,
  options?: BilinovelFetchNovelChapterOptions
) {
  const pathname = `/novel/${nid}/${cid}${pageCount > 1 ? `_${pageCount}` : ''}.html`;
  const html = await fetch(pathname, { selector: '.mlfy_main' });
  if (!html) return undefined;

  const document = createDocument(html);

  if (
    hasText(document, [
      '抱歉，作品已下架！',
      '小说下架了',
      '抱歉，该小说不存在！',
      '沒有可閱讀的章節'
    ])
  ) {
    throw new BilinovelError(pathname, `This novel ${nid} and chapter ${cid} has been taken down.`);
  }

  if (
    !document.querySelector('#mlfy_main_text') ||
    !document.querySelector('#mlfy_main_text > h1')
  ) {
    throw new BilinovelError(pathname);
  }

  const rawTitle = document.querySelector('#mlfy_main_text > h1')?.textContent;
  if (!rawTitle) return undefined;

  const { title, current, total } = parseTitle(rawTitle);
  if (!title || current > total) return undefined;

  let content = extractChapterContent(document, nid, cid);

  content = content.trim();

  if (!content) return undefined;

  if (options?.transformBbcode) {
    content = transformBbcode(content);
  }

  let images = Array.from(document.querySelectorAll('#mlfy_main_text > #TextContent img')).map(
    (element) => {
      const src = element.getAttribute('data-src') || element.getAttribute('src');
      const alt = element.getAttribute('alt');

      return {
        src: src || undefined,
        alt: alt || undefined
      } as { src: string; alt: string | undefined };
    }
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

  const pagination = document.querySelector('.mlfy_page > a:last-child')?.getAttribute('href');
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

function hasText(document: Document, texts: string[]) {
  const content = document.body?.textContent || '';
  return texts.some((text) => content.includes(text));
}

function parseVolumesFromNovelDocument(
  document: Document,
  nid: number,
  transformImgSrc?: string | ((url: string) => string | undefined | null)
) {
  return Array.from(document.querySelectorAll('.book-vol-chapter > a')).map((element) => {
    const href = element.getAttribute('href');
    const title = element.getAttribute('title') || '';
    const img = element.querySelector('.tit.fl')?.getAttribute('style');
    const volume = element.querySelector('h4')?.textContent?.trim() || '';

    const vidMatch = href?.match(/vol_(\d+)\.html/);
    const vid = vidMatch ? +vidMatch[1] : 0;

    const imgMatch = img?.match(/url\(['"]?(.*?)['"]?\)/);
    let cover = imgMatch ? imgMatch[1] : '';

    if (cover && transformImgSrc) {
      cover = applyTransformImgSrc(cover, transformImgSrc);
    }

    return {
      nid,
      vid,
      title,
      cover,
      volume
    };
  });
}

function parseVolumesFromCatalogDocument(
  document: Document,
  nid: number,
  transformImgSrc?: string | ((url: string) => string | undefined | null)
) {
  return Array.from(document.querySelectorAll('.volume-list > .volume')).map((element) => {
    const href = element.querySelector('a')?.getAttribute('href');
    const title = element.querySelector('h2')?.textContent?.trim() || '';
    let cover = element.querySelector('img')?.getAttribute('data-original') || '';
    const volume = '';

    const vidMatch = href?.match(/vol_(\d+)\.html/);
    const vid = vidMatch ? +vidMatch[1] : 0;

    if (cover && transformImgSrc) {
      cover = applyTransformImgSrc(cover, transformImgSrc);
    }

    return {
      nid,
      vid,
      title,
      cover,
      volume
    };
  });
}

function extractAuthors(document: Document) {
  let authors = Array.from(document.querySelectorAll('.book-author .au-name a')).map((link) => {
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

    const ruby = link.querySelector('ruby');
    const rt = ruby?.querySelector('rt');
    let position = rt?.textContent ? normalizePosition(rt.textContent) : '';
    if (!position) {
      const href = link.getAttribute('href') || '';
      position = parsePositionFromHref(href) || 'author';
    }

    let name = '';
    if (ruby) {
      const cloned = ruby.cloneNode(true) as HTMLElement;
      cloned.querySelectorAll?.('rt, rp').forEach((node: any) => node.remove());
      name = normalizeName(cloned.textContent || '');
    } else {
      name = normalizeName(link.textContent || '');
    }

    return name ? { name, position } : null;
  });

  authors = authors.filter((item) => item !== null);

  if (authors.length === 0) {
    const authorMeta =
      document.querySelector('meta[property="og:novel:author"]')?.getAttribute('content') ||
      document.querySelector('meta[name="author"]')?.getAttribute('content') ||
      '';
    const authorPositionFallback =
      document.querySelector('.book-author .au-head em')?.textContent || '';
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

  return authors as AuthorResult[];
}

function extractChapterContent(document: Document, nid: number, cid: number) {
  const container = document.querySelector('#mlfy_main_text > #TextContent');
  if (!container) return '';

  /**
   * 还原段落顺序（基于 chapterId 的确定性排列）
   * @param {HTMLElement} container
   * @param {number|string} chapterId
   */
  function restoreParagraphOrder(container: HTMLDivElement, cid: number) {
    const allNodes = Array.from(container.childNodes) as HTMLElement[];
    const paragraphs = [];

    for (var i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      if (
        node &&
        node.nodeType === 1 &&
        node.tagName.toLowerCase() === 'p' &&
        node.innerHTML.replace(/\s+/g, '').length > 0
      ) {
        paragraphs.push({ node: node, idx: i });
      }
    }

    const total = paragraphs.length;
    if (!total) return;

    const KEEP_HEAD = 20;

    const seed = cid * 126 + 232;
    const order: number[] = [];

    if (total > KEEP_HEAD) {
      const head: number[] = [];
      const tail: number[] = [];

      function shuffle(arr: number[], seed: number) {
        const len = arr.length;
        for (let j = len - 1; j > 0; j--) {
          seed = (seed * 9302 + 49397) % 233280;
          const k = Math.floor((seed / 233280) * (j + 1));
          const tmp = arr[j];
          arr[j] = arr[k];
          arr[k] = tmp;
        }
        return arr;
      }

      for (let i = 0; i < total; i++) {
        if (i < KEEP_HEAD) {
          head.push(i);
        } else {
          tail.push(i);
        }
      }
      shuffle(tail, seed);
      order.push(...head.concat(tail));
    } else {
      for (let i = 0; i < total; i++) {
        order.push(i);
      }
    }

    const reordered: HTMLElement[] = [];
    for (let i = 0; i < total; i++) {
      reordered[order[i]] = paragraphs[i].node;
    }

    let cursor = 0;
    for (let i = 0; i < allNodes.length; i++) {
      const nNode = allNodes[i];
      if (
        nNode &&
        nNode.nodeType === 1 &&
        nNode.tagName.toLowerCase() === 'p' &&
        nNode.innerHTML.replace(/\s+/g, '').length > 0
      ) {
        allNodes[i] = reordered[cursor++];
      }
    }

    container.innerHTML = '';
    for (let i = 0; i < allNodes.length; i++) {
      if (allNodes[i]) container.appendChild(allNodes[i]);
    }
  }

  const getNodeString = (node: HTMLElement): string => {
    if (!node) return '';
    if (node.nodeType === 8) return '';
    if (node.nodeType === 3) return (node.textContent || '').trim();
    if (node.nodeType === 1) {
      const className = node.getAttribute?.('class') || '';
      if (className.includes('google')) return '';
      if (className.includes('dag')) return '';
      if (className.includes('ad-slot')) return '';

      const id = node.getAttribute?.('id') || '';
      if (id.includes('hidden-images')) return '';
      if (id.includes('show-more-images')) return '';

      if (node.nodeName === 'BR') return '<br/>';

      if (node.nodeName === 'P') {
        return `<p>${node.innerHTML}</p>`;
      }

      if (node.nodeName === 'IMG') {
        const cloned = node.cloneNode(true) as HTMLElement;
        cloned.removeAttribute?.('class');
        const realSrc = cloned.getAttribute?.('data-src');
        if (realSrc) {
          cloned.removeAttribute?.('data-src');
          cloned.setAttribute?.('src', realSrc);
        }
        return (cloned.outerHTML || '').replace(/>$/, '/>');
      }

      if (node.nodeName === 'SMALL' && node.querySelector?.('p')) {
        return Array.from(node.childNodes).reduce(
          (acc, child) => acc + getNodeString(child as HTMLElement),
          ''
        );
      }

      return node.outerHTML || '';
    }
    return '';
  };

  restoreParagraphOrder(container as HTMLDivElement, cid);

  const paragraphs = Array.from(container.childNodes).map((node) =>
    getNodeString(node as HTMLElement)
  );

  return paragraphs.reduce((acc, text) => acc + text, '');
}
