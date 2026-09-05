import { descriptionToText } from '../src/lib/novel-description';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../src/lib/api';
import {
  authorRole,
  formatNovelDate,
  novelHead,
  novelOptions,
  parseNovelId,
  parseNovelResponse,
  preloadNovel,
  type Novel
} from '../src/lib/novel';

vi.mock('../src/lib/api', () => ({ apiFetch: vi.fn() }));
const novel: Novel = {
  nid: 1,
  name: '测试小说',
  authors: [],
  labels: [],
  description: '<p>简介 &amp; 内容</p>',
  volumes: [],
  updatedAt: '2026-09-05T18:30:00Z'
};
beforeEach(() => vi.mocked(apiFetch).mockReset());

describe('novel query lifecycle', () => {
  it('hydrates one SSR request without fetching again and isolates novels and requests', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ ok: true, data: novel }));
    const server = new QueryClient();
    const data = await preloadNovel(server, 1);
    const client = new QueryClient();
    hydrate(client, dehydrate(server));
    expect(await client.fetchQuery(novelOptions(1))).toEqual(data);
    expect(data?.description).toBe('简介 & 内容');
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/api/bili/novel/1', expect.any(AbortSignal));
    expect(client.getQueryData(['bili-novel', 2])).toBeUndefined();
    const other = new QueryClient();
    expect(other.getQueryData(['bili-novel', 1])).toBeUndefined();
    server.clear();
    client.clear();
    other.clear();
  });

  it('clears failed SSR data and allows a browser retry without force', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response('timeout', { status: 408 }));
    const client = new QueryClient();
    expect(await preloadNovel(client, 1)).toBeUndefined();
    expect(client.getQueryState(['bili-novel', 1])).toBeUndefined();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: novel }));
    expect(await client.fetchQuery({ ...novelOptions(1), retryDelay: 0 })).toMatchObject({
      nid: 1
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(apiFetch).mock.calls.every(([url]) => url === '/api/bili/novel/1')).toBe(true);
    client.clear();
  });

  it('stops after one retry and permits explicit recovery', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => new Response(null, { status: 500 }));
    const client = new QueryClient();
    await expect(client.fetchQuery({ ...novelOptions(1), retryDelay: 0 })).rejects.toThrow(
      '加载失败'
    );
    expect(apiFetch).toHaveBeenCalledTimes(2);
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: true, data: novel }));
    expect(await client.fetchQuery(novelOptions(1))).toMatchObject({ nid: 1 });
    client.clear();
  });

  it('retains a 404 as a non-retryable cached result', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response('not found', { status: 404 }));
    const client = new QueryClient();
    expect(await preloadNovel(client, 1)).toBeNull();
    expect(await client.fetchQuery(novelOptions(1))).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('rejects malformed responses and wrong novel IDs but preserves empty and deleted data', async () => {
    for (const payload of [
      { ok: false },
      { ok: true },
      { ok: true, data: {} },
      { ok: true, data: { ...novel, authors: [null] } },
      { ok: true, data: { ...novel, volumes: [null] } },
      { ok: true, data: { ...novel, labels: [3] } },
      { ok: true, data: { ...novel, nid: 2 } }
    ]) {
      await expect(parseNovelResponse(Response.json(payload), 1)).rejects.toThrow('小说数据无效');
    }
    await expect(
      parseNovelResponse(Response.json({ ok: true, data: { ...novel, isDeleted: true } }), 1)
    ).resolves.toMatchObject({ volumes: [], isDeleted: true });
  });
});

describe('novel presentation', () => {
  it('accepts only safe decimal IDs', () => {
    for (const raw of ['', '-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', '9007199254740992'])
      expect(parseNovelId(raw)).toBeUndefined();
    expect(parseNovelId('001')).toBe(1);
    expect(parseNovelId('0')).toBe(0);
  });

  it('decodes entities, preserves paragraphs, and omits executable/hidden HTML', () => {
    expect(
      descriptionToText(
        '<p>甲 &amp; &#20057;<br/>丙&nbsp;丁</p><p>&lt;文字&gt; &quot;引号&quot;</p><script>alert(1)</script><style>body{}</style><!-- hidden --><template>隐藏</template>'
      )
    ).toBe('甲 & 乙\n丙 丁\n\n<文字> "引号"');
    expect(descriptionToText('')).toBe('');
    expect(descriptionToText('<img src=x onerror=alert(1)><b>内容')).toBe('内容');
  });

  it('does not turn HTML source whitespace into extra line breaks', () => {
    expect(descriptionToText('第一句<br>\n第二句<br />\r\n\t第三句')).toBe(
      '第一句\n第二句\n第三句'
    );
    expect(descriptionToText('<p>第一段</p>\n  <p>第二段</p>')).toBe('第一段\n\n第二段');
    expect(descriptionToText('第一句<br>\n<br>\n第二句')).toBe('第一句\n\n第二句');
    expect(descriptionToText('word \n <strong>another</strong> word')).toBe('word another word');
  });

  it('formats Shanghai dates and author roles without inferring book status', () => {
    expect(formatNovelDate(novel.updatedAt)).toBe('2026/09/06');
    expect(formatNovelDate('invalid')).toBe('未知');
    expect(authorRole('illustrator')).toBe('插画');
    expect(authorRole('原作')).toBe('原作');
  });

  it('uses stable detail SEO and noindex for missing or deleted data', () => {
    expect(novelHead(novel).links).toEqual([
      { rel: 'canonical', href: 'https://lnovel.animes.garden/bili/novel/1' }
    ]);
    for (const data of [undefined, null, { ...novel, isDeleted: true }])
      expect(novelHead(data).meta).toContainEqual({ name: 'robots', content: 'noindex' });
    expect(novelHead().links).toBeUndefined();
  });
});
