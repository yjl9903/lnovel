import { Cover, EpubPublication, Image, Navigation, StyleSheet, XHTML } from '@epubook/core';
import { bundle } from '@epubook/bundler';
import { parseHTML, XHTMLBuilder, type Element, type ElementContent } from '@epubook/xml';
import type { Novel } from './novel';
import { descriptionToText } from './novel-description';
import { imageProxyUrl, prepareImage } from './epub-images';

export type EpubProgress = {
  phase: 'preparing' | 'chapters' | 'images' | 'bundling';
  current: number;
  total: number;
};
export type VolumeSummary = Novel['volumes'][number];
type ChapterInfo = { nid: number; vid: number; cid: number; title: string };
type Volume = {
  nid: number;
  vid: number;
  done?: boolean;
  chapters: ChapterInfo[];
  description?: string;
  cover?: string;
  updatedAt?: string;
};
type Chapter = ChapterInfo & { content: string };
type ExportOptions = {
  novel: Novel;
  volume: VolumeSummary;
  origin: string;
  signal: AbortSignal;
  onProgress: (progress: EpubProgress) => void;
};
const notReady = '本卷内容尚未准备好，请稍后重试。';
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const validId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

async function request(url: string, signal: AbortSignal, label: string) {
  signal.throwIfAborted();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error(label + '失败（HTTP ' + response.status + '），请稍后重试。');
    }
    return response;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.message.startsWith(label)) throw error;
    throw new Error(label + '失败或超时，请稍后重试。');
  }
}

async function json(
  url: string,
  signal: AbortSignal,
  label: string
): Promise<Record<string, unknown>> {
  const response = await request(url, signal, label);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    signal.throwIfAborted();
    throw new Error(label + '响应无效，请稍后重试。');
  }
  if (!object(payload) || payload.ok !== true || !object(payload.data)) {
    throw new Error(label + '数据无效，请稍后重试。');
  }
  return payload.data;
}

function volumeData(data: Record<string, unknown>, nid: number, vid: number): Volume {
  if (
    data.nid !== nid ||
    data.vid !== vid ||
    !Array.isArray(data.chapters) ||
    data.chapters.some(
      (ch) =>
        !object(ch) ||
        ch.nid !== nid ||
        ch.vid !== vid ||
        !validId(ch.cid) ||
        typeof ch.title !== 'string'
    ) ||
    ['description', 'cover', 'updatedAt'].some(
      (key) => data[key] !== undefined && typeof data[key] !== 'string'
    )
  ) {
    throw new Error('分卷数据无效，请稍后重试。');
  }
  if (data.done !== true || data.chapters.length === 0) throw new Error(notReady);
  const volume = data as Volume;
  if (new Set(volume.chapters.map((chapter) => chapter.cid)).size !== volume.chapters.length) {
    throw new Error('分卷目录存在重复章节，请稍后重试。');
  }
  return volume;
}

function chapterData(data: Record<string, unknown>, info: ChapterInfo): Chapter {
  if (
    data.nid !== info.nid ||
    data.vid !== info.vid ||
    data.cid !== info.cid ||
    typeof data.title !== 'string' ||
    !data.title.trim() ||
    typeof data.content !== 'string' ||
    !data.content.trim()
  ) {
    throw new Error('章节「' + info.title + '」数据无效，请稍后重试。');
  }
  return data as Chapter;
}

const dropped = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'link',
  'meta',
  'base'
]);
const allowed = new Set([
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'blockquote',
  'ul',
  'ol',
  'li',
  'ruby',
  'rt',
  'rp',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img'
]);
const element = (
  name: string,
  children: ElementContent[] = [],
  attributes: Element['attributes'] = {}
): Element => ({ type: 'element', name, attributes, children });

// Parse as inert HTML; rebuild only supported XHTML nodes and attributes.
function chapterBody(
  content: string,
  origin: string,
  images: Map<string, Element[]>
): ElementContent[] {
  function clean(node: ElementContent): ElementContent[] {
    if (node.type === 'text') {
      return [
        { type: 'text', value: node.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') }
      ];
    }
    if (node.type !== 'element' || dropped.has(node.name)) return [];
    const children = node.children.flatMap(clean);
    if (node.name === 'center') return [element('div', children, { class: 'center' })];
    if (!allowed.has(node.name)) return children;
    const attrs: Element['attributes'] = {};
    if (node.name === 'a' && node.attributes.href) {
      try {
        const url = new URL(String(node.attributes.href), 'https://www.linovelib.com/');
        if (['http:', 'https:'].includes(url.protocol)) attrs.href = url.href;
      } catch {
        /* Keep the link text. */
      }
    }
    if (node.name === 'td' || node.name === 'th') {
      for (const key of ['colspan', 'rowspan']) {
        if (/^[1-9]\d{0,2}$/.test(String(node.attributes[key]))) attrs[key] = node.attributes[key];
      }
    }
    const result = element(node.name, children, attrs);
    if (node.name === 'img') {
      const src = node.attributes['data-src'] || node.attributes.src;
      if (typeof src !== 'string' || !src.trim())
        throw new Error('章节图片缺少地址，无法下载完整 EPUB。');
      const url = imageProxyUrl(src, origin);
      attrs.alt = String(node.attributes.alt || '');
      attrs.src = url;
      const references = images.get(url) || [];
      references.push(result);
      images.set(url, references);
    }
    return [result];
  }
  const body = parseHTML(content, { fragment: true }).children.flatMap((node) =>
    node.type === 'doctype' ? [] : clean(node)
  );
  const meaningful = (nodes: ElementContent[]): boolean =>
    nodes.some((node) =>
      node.type === 'text'
        ? !!node.value.trim()
        : node.type === 'element' && (node.name === 'img' || meaningful(node.children))
    );
  if (!meaningful(body)) throw new Error('章节正文为空，无法下载完整 EPUB。');
  return body;
}

function page(filename: string, title: string, body: ElementContent[]) {
  const result = new XHTMLBuilder(filename, { title, language: 'zh-CN' })
    .appendStyleSheet('styles/style.css')
    .appendBody(...body)
    .build();
  return new XHTML(filename, result.meta, result.content);
}

export function epubFilename(title: string) {
  return (
    (title
      .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 160) || '小说') + '.epub'
  );
}

export async function generateVolumeEpub({
  novel,
  volume: summary,
  origin,
  signal,
  onProgress
}: ExportOptions) {
  const progress = (phase: EpubProgress['phase'], current = 0, total = 0) => {
    signal.throwIfAborted();
    onProgress({ phase, current, total });
  };
  progress('preparing');
  const base = new URL('/api/bili/novel/' + novel.nid, origin).href;
  const volume = volumeData(
    await json(base + '/vol/' + summary.vid, signal, '获取分卷'),
    novel.nid,
    summary.vid
  );
  const title = [novel.name, summary.title || summary.volume].filter(Boolean).join(' ');
  const description =
    descriptionToText(volume.description || '') || novel.description.trim() || title;
  const authors = novel.authors.filter((author) => author.name.trim());
  const creator = authors.find((author) => author.position === 'author') || authors[0];
  const date = new Date(volume.updatedAt || novel.updatedAt);
  const epub = EpubPublication.create('OEBPS/content.opf', {
    title,
    description,
    language: 'zh-CN',
    creator: { name: creator?.name || '未知', uid: 'creator' },
    contributor: authors.filter((author) => author !== creator).map(({ name }) => ({ name })),
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    lastModified: new Date(),
    source: 'https://www.linovelib.com/novel/' + novel.nid + '/vol_' + summary.vid + '.html'
  });
  const rendition = epub.rootfile;
  rendition.setIdentifier('urn:lnovel:bili:' + novel.nid + ':vol:' + summary.vid, 'book-id');
  rendition.addResource(
    new StyleSheet(
      'styles/style.css',
      'body{line-height:1.7}p{text-indent:2em}img{max-width:100%;height:auto}.center,.cover{text-align:center}.cover img{max-height:95vh}h1{font-size:1.5em}'
    )
  );

  const images = new Map<string, Element[]>();
  const coverSrc = volume.cover || summary.cover;
  const coverUrl = coverSrc ? imageProxyUrl(coverSrc, origin) : undefined;
  if (coverUrl) images.set(coverUrl, []);
  const chapters: { title: string; body: ElementContent[] }[] = [];
  progress('chapters', 0, volume.chapters.length);
  for (const info of volume.chapters) {
    const chapter = chapterData(
      await json(base + '/chapter/' + info.cid, signal, '获取章节「' + info.title + '」'),
      info
    );
    signal.throwIfAborted();
    chapters.push({ title: chapter.title, body: chapterBody(chapter.content, origin, images) });
    progress('chapters', chapters.length, volume.chapters.length);
  }

  let imageIndex = 0;
  progress('images', 0, images.size);
  for (const [url, nodes] of images) {
    const label = url === coverUrl ? '获取封面' : '获取插图 ' + (imageIndex + 1);
    try {
      const response = await request(url, signal, label);
      const image = await prepareImage(new Uint8Array(await response.arrayBuffer()), signal);
      const filename = 'images/image-' + ++imageIndex + '.' + image.extension;
      const resource =
        url === coverUrl
          ? new Cover(filename, image.mediaType, image.data)
          : new Image(filename, image.mediaType, image.data);
      if (resource instanceof Cover) {
        rendition.setCover(resource);
        const cover = page('cover.xhtml', '封面', [
          element('div', [element('img', [], { src: filename, alt: title })], { class: 'cover' })
        ]);
        rendition.addResource(cover);
        rendition.spine.push(cover.itemref());
      } else rendition.addResource(resource);
      for (const node of nodes) node.attributes.src = filename;
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(label + '失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    }
    progress('images', imageIndex, images.size);
  }

  const navigation = chapters.map((chapter, index) => {
    const resource = page('chapter-' + (index + 1) + '.xhtml', chapter.title, [
      element('h1', [{ type: 'text', value: chapter.title }]),
      ...chapter.body
    ]);
    rendition.addResource(resource);
    rendition.spine.push(resource.itemref());
    return { title: chapter.title, resource };
  });
  rendition.setNavigation(new Navigation('nav.xhtml', navigation, { title: '目录' }));
  progress('bundling');
  // Yield before CPU work so the progress and cancellation UI can render.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
  const data = await bundle(epub);
  signal.throwIfAborted();
  return {
    blob: new Blob([new Uint8Array(data)], { type: 'application/epub+zip' }),
    filename: epubFilename(title)
  };
}
