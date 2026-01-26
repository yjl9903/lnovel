import type { BilinovelFetch, BilinovelFetchOptions } from './types';

import {
  applyTransformImgSrc,
  createDocument,
  isCloudflareDocument,
  parseMappedParam,
  parsePositiveInteger,
  parseShanghaiDateTime,
  resolveMappedKey,
  resolveMappedValue,
  splitUrlForFetch
} from './utils';

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
  fetch: BilinovelFetch,
  filter: BilinovelFetchTopFilter = {},
  options?: BilinovelFetchOptions
): Promise<TopPageResult> {
  const target = buildTopURL(filter, options);
  const { path, query } = splitUrlForFetch(target);
  const html = await fetch(path, query);
  const document = createDocument(html);

  if (isCloudflareDocument(document)) {
    throw new Error(`"${target.toString()}" was blocked by cloudflare`);
  }

  const rawTitle =
    document.querySelector('.rank_i_title_name .active')?.textContent ||
    document.querySelector('.rank_i_title_name')?.textContent ||
    '';
  const title = rawTitle.trim() || undefined;

  const novels = Array.from(document.querySelectorAll('.rank_d_list')).map((element) => {
    const nameLink = element.querySelector('.rank_d_b_name a');
    const coverLink = element.querySelector('.rank_d_book_img a');
    const href = nameLink?.getAttribute('href') || coverLink?.getAttribute('href');
    const nidMatch = href?.match(/\/novel\/(\d+)\.html/);
    const nid = nidMatch ? Number(nidMatch[1]) : 0;

    const title = nameLink?.textContent?.trim() || '';

    let cover =
      element.querySelector('.rank_d_book_img img')?.getAttribute('data-original') ||
      element.querySelector('.rank_d_book_img img')?.getAttribute('src') ||
      undefined;

    if (cover && options?.transformImgSrc) {
      cover = applyTransformImgSrc(cover, options.transformImgSrc);
    }

    const meta = Array.from(element.querySelectorAll('.rank_d_b_cate a'))
      .map((item) => item.textContent?.trim() || '')
      .filter(Boolean);
    const [author, library, status] = meta;

    const description = element.querySelector('.rank_d_b_info')?.textContent?.trim() || '';

    let latestChapter = element.querySelector('.rank_d_b_last a')?.textContent || undefined;
    if (latestChapter) {
      latestChapter = latestChapter.trim().replace(/^最新章节\s*/, '');
    }

    const updatedAtStr = element.querySelector('.rank_d_b_time')?.textContent?.trim() || '';
    const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : undefined;

    const rankStr =
      element.querySelector('.rank_d_b_rank .rank_d_b_num')?.textContent?.trim() || '';
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
  });

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

  const inputSort = /\/top\/(.*)\/.*/.exec(input.pathname)?.[1];
  const sort = parseMappedParam(TOP_SORT, inputSort || input.pathname.split('/').at(-1));
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
