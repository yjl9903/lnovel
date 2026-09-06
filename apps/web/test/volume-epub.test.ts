import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { JSDOM } from 'jsdom';
import { generateVolumeEpub, epubFilename, type EpubProgress } from '../src/lib/volume-epub';
import { imageProxyUrl, prepareImage } from '../src/lib/epub-images';
import { epubNovel, epubVolume, epubChapters, epubResponse, png } from './fixtures/epub';

const origin = 'https://local.example';
const options = () => ({
  novel: epubNovel,
  volume: epubNovel.volumes[0],
  origin,
  signal: new AbortController().signal,
  onProgress: vi.fn<(p: EpubProgress) => void>()
});
function setup() {
  const fetcher = vi.fn(async (url: string) => epubResponse(url));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const xml = (source: string) =>
  new JSDOM(source, { contentType: 'application/xml' }).window.document;
afterEach(() => vi.unstubAllGlobals());

describe('volume EPUB export', () => {
  it('exports ordered, self-contained chapters with safe XHTML, images and metadata', async () => {
    const fetcher = setup();
    const opts = options();
    const result = await generateVolumeEpub(opts);
    expect(result.blob.type).toBe('application/epub+zip');
    expect(result.filename).toBe('测试小说 & _书名_ 第一卷.epub');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    // The first ZIP entry is the uncompressed EPUB mimetype.
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
    expect(strFromU8(bytes.slice(30, 38))).toBe('mimetype');
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype)).toBe('application/epub+zip');
    const opf = xml(strFromU8(files['OEBPS/content.opf']));
    expect(opf.getElementsByTagName('dc:contributor')[0].textContent).toBe('插画 & <乙>');
    expect(opf.getElementsByTagName('dc:description')[0].textContent).toBe('卷简介 & 内容');
    for (const item of opf.getElementsByTagName('item')) {
      expect(files['OEBPS/' + item.getAttribute('href')]).toBeDefined();
    }
    expect(
      [...opf.getElementsByTagName('itemref')].map((item) => item.getAttribute('idref'))
    ).toEqual(['cover', 'chapter-1', 'chapter-2']);
    const nav = xml(strFromU8(files['OEBPS/nav.xhtml']));
    expect([...nav.getElementsByTagName('a')].map((a) => a.textContent)).toEqual([
      '第二编号先读',
      '第一编号后读'
    ]);
    for (const [path, bytes] of Object.entries(files)) {
      if (!path.endsWith('.xhtml')) continue;
      const document = xml(strFromU8(bytes));
      for (const tag of ['img', 'link', 'a']) {
        for (const node of document.getElementsByTagName(tag)) {
          const href = node.getAttribute(tag === 'img' ? 'src' : 'href');
          if (href && !href.startsWith('https:')) expect(files['OEBPS/' + href]).toBeDefined();
        }
      }
    }
    const chapter = strFromU8(files['OEBPS/chapter-1.xhtml']);
    expect(chapter).toContain('class="center"');
    expect(chapter).toContain('<ruby>');
    expect(xml(chapter).getElementsByTagName('br')).toHaveLength(1);
    expect(chapter).not.toMatch(/onclick|script|javascript:|data-src|placeholder/);
    expect(Object.keys(files).filter((path) => path.startsWith('OEBPS/images/'))).toHaveLength(2);
    expect(files['OEBPS/images/image-1.png']).toEqual(png);
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/bili/novel/1/vol/10',
      '/api/bili/novel/1/chapter/102',
      '/api/bili/novel/1/chapter/101',
      '/bili/files/cover.jpg',
      '/bili/img3/illustration.jpg'
    ]);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(opts.onProgress.mock.calls.at(-1)?.[0].phase).toBe('bundling');
  });

  it.each([false, undefined])('does not export a volume whose done flag is %s', async (done) => {
    const fetcher = setup().mockResolvedValue(
      Response.json({ ok: true, data: { ...epubVolume, done } })
    );
    await expect(generateVolumeEpub(options())).rejects.toThrow('尚未准备好');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { chapters: [] },
    { nid: 2 },
    { vid: 2 },
    { chapters: [{ ...epubVolume.chapters[0], vid: 20 }] },
    { chapters: [epubVolume.chapters[0], epubVolume.chapters[0]] }
  ])('rejects an empty or invalid volume %j', async (changes) => {
    setup().mockResolvedValue(Response.json({ ok: true, data: { ...epubVolume, ...changes } }));
    await expect(generateVolumeEpub(options())).rejects.toThrow();
  });

  it.each([
    { ok: false },
    { ok: true, data: {} },
    { ok: true, data: { ...epubChapters[0], nid: 2 } },
    { ok: true, data: { ...epubChapters[0], vid: 20 } },
    { ok: true, data: { ...epubChapters[0], cid: 101 } },
    { ok: true, data: { ...epubChapters[0], content: '' } },
    { ok: true, data: { ...epubChapters[0], content: '<script>bad()</script>' } }
  ])('rejects invalid/missing chapter content %j', async (payload) => {
    setup()
      .mockResolvedValueOnce(epubResponse(origin + '/api/bili/novel/1/vol/10'))
      .mockResolvedValueOnce(Response.json(payload));
    await expect(generateVolumeEpub(options())).rejects.toThrow();
  });

  it.each([408, 404, 500])('propagates API failure %s', async (status) => {
    setup().mockResolvedValue(new Response(null, { status }));
    await expect(generateVolumeEpub(options())).rejects.toThrow('HTTP ' + status);
  });

  it.each(['/bili/files/cover.jpg', '/bili/img3/illustration.jpg'])(
    'fails when image %s is missing',
    async (path) => {
      setup().mockImplementation(async (url) =>
        new URL(url).pathname === path ? new Response(null, { status: 404 }) : epubResponse(url)
      );
      await expect(generateVolumeEpub(options())).rejects.toThrow('失败');
    }
  );

  it('rejects invalid JSON, network errors, and HTML masquerading as an image', async () => {
    const fetcher = setup().mockResolvedValue(new Response('not json'));
    await expect(generateVolumeEpub(options())).rejects.toThrow('响应无效');
    fetcher.mockRejectedValue(new TypeError('network'));
    await expect(generateVolumeEpub(options())).rejects.toThrow('失败或超时');
    fetcher.mockImplementation(async (url) =>
      new URL(url).pathname.startsWith('/bili/')
        ? new Response('<html>blocked</html>')
        : epubResponse(url)
    );
    await expect(generateVolumeEpub(options())).rejects.toThrow('图片格式无法识别');
  });

  it.each(['', '小说简介'])(
    'uses a non-empty description fallback (%s) and permits absent covers',
    async (description) => {
      setup().mockImplementation(async (url) =>
        url.includes('/vol/')
          ? Response.json({ ok: true, data: { ...epubVolume, description: '', cover: '' } })
          : epubResponse(url)
      );
      const opts = options();
      opts.novel = { ...epubNovel, description };
      opts.volume = { ...opts.volume, cover: '' };
      const result = await generateVolumeEpub(opts);
      const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
      const opf = xml(strFromU8(files['OEBPS/content.opf']));
      expect(opf.getElementsByTagName('dc:description')[0].textContent).toBe(
        description || '测试小说 & <书名> 第一卷'
      );
      expect(files['OEBPS/cover.xhtml']).toBeUndefined();
    }
  );

  it('stops before requests or during chapters, images and bundling when cancelled', async () => {
    for (const phase of ['preparing', 'chapters', 'images', 'bundling']) {
      setup();
      const controller = new AbortController();
      await expect(
        generateVolumeEpub({
          ...options(),
          signal: controller.signal,
          onProgress: (progress) => {
            if (progress.phase === phase) controller.abort();
          }
        })
      ).rejects.toMatchObject({ name: 'AbortError' });
    }
  });

  it('passes cancellation to an in-flight request', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
          })
      )
    );
    const result = generateVolumeEpub({ ...options(), signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('EPUB image handling', () => {
  it('normalizes proxy hosts and supported upstream URLs to the current origin', () => {
    for (const src of [
      '/files/a.jpg',
      'https://www.linovelib.com/files/a.jpg',
      'http://old.example/bili/files/a.jpg'
    ]) {
      expect(imageProxyUrl(src, origin)).toBe(origin + '/bili/files/a.jpg');
    }
    expect(imageProxyUrl('//img3.readpai.com/a.jpg?v=2', origin)).toBe(
      origin + '/bili/img3/a.jpg?v=2'
    );
    for (const src of ['javascript:bad()', 'https://other.example/a.jpg', '/other.png']) {
      expect(() => imageProxyUrl(src, origin)).toThrow();
    }
  });

  it.each([
    [png, 'image/png'],
    [new Uint8Array([255, 216, 255, 224]), 'image/jpeg'],
    [new TextEncoder().encode('GIF89a'), 'image/gif'],
    [new TextEncoder().encode('RIFF1234WEBP'), 'image/webp']
  ])('identifies bytes instead of trusting the URL suffix', async (input, type) => {
    expect(
      (await prepareImage(input as Uint8Array<ArrayBuffer>, new AbortController().signal)).mediaType
    ).toBe(type);
  });

  it('converts AVIF to PNG and releases decoding resources', async () => {
    const bitmap = { width: 4, height: 5, close: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: (b: Blob) => void) => callback(new Blob([png]))
    };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap)
    );
    vi.stubGlobal('document', { createElement: () => canvas });
    const avif = new Uint8Array([0, 0, 0, 20, ...new TextEncoder().encode('ftypavif0000avif')]);
    expect((await prepareImage(avif, new AbortController().signal)).mediaType).toBe('image/png');
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('cleans unsafe filenames', () => {
    expect(epubFilename('a/b:c*?. ')).toBe('a_b_c__.epub');
  });
});
