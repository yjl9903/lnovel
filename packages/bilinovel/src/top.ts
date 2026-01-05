import type { BrowserContext } from 'playwright';

import { blockRoutes, isCloudflarePage } from './browser';
import type { BilinovelFetchOptions } from './types';
import { applyTransformImgSrc, parseShanghaiDateTime } from './utils';

export const TOP_SORT = {
  monthVisit: 'monthvisit',
  weekVisit: 'weekvisit',
  monthVote: 'monthvote',
  weekVote: 'weekvote',
  monthFlower: 'monthflower',
  weekFlower: 'weekflower',
  monthEgg: 'monthegg',
  weekEgg: 'weekegg',
  lastUpdate: 'lastupdate',
  postDate: 'postdate',
  favorites: 'goodnum',
  newHot: 'newhot'
} as const;

export type TopSort = keyof typeof TOP_SORT | (typeof TOP_SORT)[keyof typeof TOP_SORT];

const TOP_SORT_LABELS: Record<keyof typeof TOP_SORT, string> = {
  monthVisit: '月点击榜',
  weekVisit: '周点击榜',
  monthVote: '月推荐榜',
  weekVote: '周推荐榜',
  monthFlower: '月鲜花榜',
  weekFlower: '周鲜花榜',
  monthEgg: '月鸡蛋榜',
  weekEgg: '周鸡蛋榜',
  lastUpdate: '最近更新',
  postDate: '最新入库',
  favorites: '收藏榜',
  newHot: '新书榜'
};

export interface BilinovelFetchTopFilter {
  /**
   * @default TOP_SORT.monthVisit
   */
  sort?: TopSort;

  /**
   * 页码
   * @default 1
   */
  page?: number;
}

export interface TopNovelItem {
  rank?: number;
  nid: number;
  title: string;
  cover?: string;
  author?: string;
  library?: string;
  status?: string;
  updatedAt: Date;
  latestChapter?: string;
  description: string;
}

export interface TopPageResult {
  url: string;
  title?: string;
  items: TopNovelItem[];
  pagination: {
    current: number;
    total?: number;
  };
  fetchedAt: Date;
}

export async function fetchTopPage(
  context: BrowserContext,
  filter: BilinovelFetchTopFilter = {},
  options?: BilinovelFetchOptions
): Promise<TopPageResult> {
  const page = await context.newPage();
  await blockRoutes(page);

  const target = buildTopURL(filter, options);

  await page.goto(target.toString());

  if (await isCloudflarePage(page)) {
    throw new Error('blocked by cloudflare');
  }

  const rawTitle =
    (await page.locator('.rank_i_title_name .active').first().textContent()) ||
    (await page.locator('.rank_i_title_name').first().textContent()) ||
    '';
  const title = rawTitle.trim() || undefined;

  const novels = await Promise.all(
    (await page.locator('.rank_d_list').all()).map(async (locator) => {
      const href =
        (await locator.locator('.rank_d_b_name a').first().getAttribute('href')) ||
        (await locator.locator('.rank_d_book_img a').first().getAttribute('href'));
      const nidMatch = href?.match(/\/novel\/(\d+)\.html/);
      const nid = nidMatch ? Number(nidMatch[1]) : 0;

      const title = (await locator.locator('.rank_d_b_name a').first().textContent())?.trim() || '';

      let cover =
        (await locator.locator('.rank_d_book_img img').first().getAttribute('data-original')) ||
        (await locator.locator('.rank_d_book_img img').first().getAttribute('src')) ||
        undefined;

      if (cover && options?.transformImgSrc) {
        cover = applyTransformImgSrc(cover, options.transformImgSrc);
      }

      const meta = (await locator.locator('.rank_d_b_cate a').allTextContents())
        .map((text) => text.trim())
        .filter(Boolean);
      const [author, library, status] = meta;

      const description = (
        (await locator.locator('.rank_d_b_info').first().textContent()) || ''
      ).trim();

      let latestChapter =
        (await locator.locator('.rank_d_b_last a').first().textContent()) || undefined;
      if (latestChapter) {
        latestChapter = latestChapter.trim().replace(/^最新章节\s*/, '');
      }

      const updatedAtStr = (
        (await locator.locator('.rank_d_b_time').first().textContent()) || ''
      ).trim();
      const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : undefined;

      const rankStr = (
        (await locator.locator('.rank_d_b_rank .rank_d_b_num').first().textContent()) || ''
      ).trim();
      const rankValue = rankStr ? Number(rankStr) : undefined;
      const rank = Number.isFinite(rankValue) ? rankValue : undefined;

      return {
        rank,
        nid,
        title,
        cover,
        author,
        library,
        status,
        updatedAt: updatedAt!,
        latestChapter,
        description
      };
    })
  );

  const items = novels.filter((item) => item.nid && item.title && item.updatedAt);

  const currentPage = filter.page ?? 1;

  return {
    url: target.toString(),
    title,
    items,
    pagination: {
      current: currentPage
    },
    fetchedAt: new Date()
  };
}

export function parseTopFilter(input: URL): BilinovelFetchTopFilter {
  const searchParams = input.searchParams;
  const filter: BilinovelFetchTopFilter = {};

  const sort = parseMappedParam(TOP_SORT, input.pathname.split('/').at(-1));
  if (sort !== undefined) filter.sort = sort;

  const page = parsePositiveInteger(searchParams.get('page'));
  if (page !== undefined) filter.page = page;

  return filter;
}

export function formatTopFilterTitle(filter: BilinovelFetchTopFilter): string {
  const target = filter;
  const sortKey = resolveMappedKey(TOP_SORT, target.sort, 'monthVisit');

  return '哔哩轻小说 ' + (TOP_SORT_LABELS[sortKey] ?? String(sortKey));
}

function buildTopURL(filter: BilinovelFetchTopFilter, options?: BilinovelFetchOptions) {
  const baseURL = options?.baseURL || 'https://www.linovelib.com/';

  const sort = resolveMappedValue(TOP_SORT, filter.sort, 'monthVisit');
  const page = filter.page ?? 1;
  return new URL(`/top/${sort}/${page}.html`, baseURL);
}

function resolveMappedKey<T extends Record<string, number | string>>(
  map: T,
  value: keyof T | T[keyof T] | undefined,
  fallback: keyof T
): keyof T {
  if (value === undefined) return fallback;
  if (Object.prototype.hasOwnProperty.call(map, value as keyof T)) {
    return value as keyof T;
  }
  const matched = (Object.keys(map) as Array<keyof T>).find((key) => map[key] === value);
  return matched ?? fallback;
}

function resolveMappedValue<T extends Record<string, number | string>>(
  map: T,
  value: keyof T | T[keyof T] | undefined,
  fallback: keyof T
): T[keyof T] {
  if (value === undefined) return map[fallback];
  if (Object.prototype.hasOwnProperty.call(map, value as keyof T)) {
    return map[value as keyof T];
  }
  const matched = Object.values(map).find((item) => item === value);
  return matched ?? (map[fallback] as any);
}

function parseMappedParam<T extends Record<string, number | string>>(
  map: T,
  input: string | null | undefined
): keyof T | T[keyof T] | undefined {
  if (input === null || input === undefined) return undefined;
  const value = input.trim();
  if (!value) return undefined;

  const keyMatch = (Object.keys(map) as Array<keyof T>).find(
    (key) => key.toString().toLowerCase() === value.toLowerCase()
  );
  if (keyMatch) return keyMatch;

  const parsed: string | number = /^\d+$/.test(value) ? Number(value) : value;
  const valMatch = (Object.values(map) as Array<T[keyof T]>).find((item) => {
    if (typeof item === 'number' && typeof parsed === 'number') return item === parsed;
    if (typeof item === 'string' && typeof parsed === 'string') {
      return item.toLowerCase() === parsed.toLowerCase();
    }
    return item === (parsed as any);
  });

  return valMatch;
}

function parsePositiveInteger(input: string | null): number | undefined {
  if (input === null) return undefined;
  const value = Number(input);
  if (!Number.isFinite(value)) return undefined;
  const num = Math.floor(value);
  return num > 0 ? num : undefined;
}
