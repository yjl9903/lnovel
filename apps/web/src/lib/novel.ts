import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { site } from './site';

export type Novel = {
  nid: number;
  name: string;
  authors: Array<{ name: string; position: string }>;
  labels: string[];
  description: string;
  cover?: string;
  volumes: Array<{ nid: number; vid: number; title: string; cover: string; volume: string }>;
  updatedAt: string;
  isDeleted?: boolean;
  follow?: { feedId: string };
};

export type NovelResponse = { ok: boolean; data?: Novel; message?: string };

export function parseNovelId(raw: string) {
  const nid = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(nid) && nid >= 0 ? nid : undefined;
}

export async function parseNovelResponse(response: Response, nid: number): Promise<Novel | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('加载失败，请稍后再试。');
  const payload = (await response.json()) as NovelResponse;
  const data = payload?.data;
  if (
    !payload?.ok ||
    !data ||
    data.nid !== nid ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    !Array.isArray(data.authors) ||
    data.authors.some(
      (author) => !author || typeof author.name !== 'string' || typeof author.position !== 'string'
    ) ||
    !Array.isArray(data.labels) ||
    data.labels.some((label) => typeof label !== 'string') ||
    !Array.isArray(data.volumes) ||
    data.volumes.some(
      (volume) =>
        !volume ||
        !Number.isSafeInteger(volume.vid) ||
        volume.vid < 0 ||
        typeof volume.title !== 'string' ||
        typeof volume.volume !== 'string' ||
        typeof volume.cover !== 'string'
    ) ||
    (data.cover !== undefined && typeof data.cover !== 'string') ||
    (data.follow !== undefined && (!data.follow || typeof data.follow.feedId !== 'string')) ||
    typeof data.description !== 'string' ||
    typeof data.updatedAt !== 'string'
  ) {
    throw new Error('小说数据无效，请稍后再试。');
  }
  const { descriptionToText } = await import('./novel-description');
  return { ...data, description: descriptionToText(data.description) };
}

export const novelOptions = (nid: number) =>
  queryOptions({
    queryKey: ['bili-novel', nid],
    queryFn: async ({ signal }) =>
      parseNovelResponse(await apiFetch(`/api/bili/novel/${nid}`, signal), nid),
    staleTime: 60_000,
    retry: 1
  });

export async function preloadNovel(queryClient: QueryClient, nid: number) {
  const options = novelOptions(nid);
  try {
    return await queryClient.fetchQuery({ ...options, retry: false });
  } catch {
    // As on the home page, recover transient SSR failures in the browser.
    queryClient.removeQueries({ queryKey: options.queryKey, exact: true });
    return undefined;
  }
}

export function novelHead(novel?: Novel | null) {
  if (!novel)
    return {
      meta: [
        { title: novel === null ? '小说不存在 · lnovel' : '小说详情 · lnovel' },
        { name: 'robots', content: 'noindex' }
      ]
    };
  return {
    meta: [
      { title: `${novel.name} · lnovel` },
      { name: 'description', content: novel.description },
      { name: 'robots', content: novel.isDeleted ? 'noindex' : 'index, follow' }
    ],
    links: [{ rel: 'canonical', href: new URL(`/bili/novel/${novel.nid}`, site.url).href }]
  };
}

export function formatNovelDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知'
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
}

export function authorRole(position: string) {
  return (
    ({ author: '作者', illustrator: '插画', translator: '译者' } as Record<string, string>)[
      position
    ] ||
    position ||
    '作者'
  );
}
