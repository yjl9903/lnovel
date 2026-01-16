import type { BrowserContext } from 'playwright';

import { blockRoutes, isCloudflarePage } from './browser';
import type { BilinovelFetchOptions } from './types';
import { applyTransformImgSrc, parseShanghaiDateTime } from './utils';

export const WENKU_SORT = {
  lastUpdate: 'lastupdate',
  postDate: 'postdate',
  weekVisit: 'weekvisit',
  monthVisit: 'monthvisit',
  weekVote: 'weekvote',
  monthVote: 'monthvote',
  weekFlower: 'weekflower',
  monthFlower: 'monthflower',
  favorites: 'goodnum'
} as const;

export type WenkuSort = keyof typeof WENKU_SORT | (typeof WENKU_SORT)[keyof typeof WENKU_SORT];

export const WENKU_TAG = {
  all: 0,
  romance: 64,
  harem: 48,
  campus: 63,
  yuri: 27,
  reincarnation: 26,
  isekai: 47,
  fantasy: 15,
  adventure: 61,
  comedy: 222,
  femalePerspective: 231,
  opProtagonist: 219,
  magic: 96,
  youth: 67,
  genderBender: 31,
  yandere: 198,
  littleSister: 217,
  childhoodFriend: 225,
  battle: 18,
  ntr: 256,
  nonHuman: 223,
  ojousama: 227,
  dark: 189,
  suspense: 68,
  sciFi: 56,
  otokonoko: 201,
  war: 55,
  loli: 185,
  revenge: 229,
  mindGame: 199,
  superpower: 131,
  grotesque: 241,
  lightLiterature: 191,
  workplace: 60,
  management: 226,
  jk: 246,
  mecha: 135,
  daughter: 261,
  apocalypse: 221,
  crime: 220,
  travel: 239,
  thriller: 124,
  healing: 98,
  mystery: 97,
  japaneseLiterature: 205,
  game: 248,
  danmei: 228,
  gourmet: 211,
  ensembleCast: 245,
  battleRoyale: 249,
  music: 233,
  fighting: 132,
  hotBlood: 28,
  warm: 180,
  imaginative: 224,
  villain: 328,
  jc: 304,
  spy: 254,
  sports: 146,
  otakuCulture: 263,
  doujin: 333
} as const;

export type WenkuTag = keyof typeof WENKU_TAG | (typeof WENKU_TAG)[keyof typeof WENKU_TAG];

export const WENKU_PROGRESS = {
  all: 0,
  newUpload: 1,
  developing: 2,
  exciting: 3,
  closing: 4,
  completed: 5
} as const;

export type WenkuProgress =
  | keyof typeof WENKU_PROGRESS
  | (typeof WENKU_PROGRESS)[keyof typeof WENKU_PROGRESS];

export const WENKU_ANIMATION = {
  all: 0,
  animated: 1,
  notAnimated: 2
} as const;

export type WenkuAnimation =
  | keyof typeof WENKU_ANIMATION
  | (typeof WENKU_ANIMATION)[keyof typeof WENKU_ANIMATION];

export const WENKU_REGION = {
  all: 0,
  japan: 1,
  chinese: 2,
  web: 3,
  comic: 4,
  korea: 5
} as const;

export type WenkuRegion =
  | keyof typeof WENKU_REGION
  | (typeof WENKU_REGION)[keyof typeof WENKU_REGION];

export const WENKU_WORD_COUNT = {
  all: 0,
  under300k: 1,
  between300kAnd500k: 2,
  between500kAnd1m: 3,
  between1mAnd2m: 4,
  above2m: 5
} as const;

export type WenkuWordCount =
  | keyof typeof WENKU_WORD_COUNT
  | (typeof WENKU_WORD_COUNT)[keyof typeof WENKU_WORD_COUNT];

export const WENKU_UPDATED_WITHIN = {
  all: 0,
  threeDays: 1,
  sevenDays: 2,
  halfMonth: 3,
  oneMonth: 4
} as const;

export type WenkuUpdatedWithin =
  | keyof typeof WENKU_UPDATED_WITHIN
  | (typeof WENKU_UPDATED_WITHIN)[keyof typeof WENKU_UPDATED_WITHIN];

export const WENKU_CHANNEL = {
  all: 0
} as const;

export type WenkuChannel =
  | keyof typeof WENKU_CHANNEL
  | (typeof WENKU_CHANNEL)[keyof typeof WENKU_CHANNEL];

export const WENKU_INITIAL = {
  all: 0
} as const;

export type WenkuInitial =
  | keyof typeof WENKU_INITIAL
  | (typeof WENKU_INITIAL)[keyof typeof WENKU_INITIAL];

const WENKU_REGION_LABELS: Record<keyof typeof WENKU_REGION, string> = {
  all: '不限',
  japan: '日本轻小说',
  chinese: '华文轻小说',
  web: 'Web 轻小说',
  comic: '轻改漫画',
  korea: '韩国轻小说'
};

const WENKU_SORT_LABELS: Record<keyof typeof WENKU_SORT, string> = {
  lastUpdate: '最新更新',
  postDate: '最新发布',
  weekVisit: '周点击',
  monthVisit: '月点击',
  weekVote: '周推荐',
  monthVote: '月推荐',
  weekFlower: '周鲜花',
  monthFlower: '月鲜花',
  favorites: '最多收藏'
};

const WENKU_TAG_LABELS: Record<keyof typeof WENKU_TAG, string> = {
  all: '不限',
  romance: '恋爱',
  harem: '后宫',
  campus: '校园',
  yuri: '百合',
  reincarnation: '转生',
  isekai: '异世界',
  fantasy: '奇幻',
  adventure: '冒险',
  comedy: '欢乐向',
  femalePerspective: '女性视角',
  opProtagonist: '龙傲天',
  magic: '魔法',
  youth: '青春',
  genderBender: '性转',
  yandere: '病娇',
  littleSister: '妹妹',
  childhoodFriend: '青梅竹马',
  battle: '战斗',
  ntr: 'NTR',
  nonHuman: '人外',
  ojousama: '大小姐',
  dark: '黑暗',
  suspense: '悬疑',
  sciFi: '科幻',
  otokonoko: '伪娘',
  war: '战争',
  loli: '萝莉',
  revenge: '复仇',
  mindGame: '斗智',
  superpower: '异能',
  grotesque: '猎奇',
  lightLiterature: '轻文学',
  workplace: '职场',
  management: '经营',
  jk: 'JK',
  mecha: '机战',
  daughter: '女儿',
  apocalypse: '末世',
  crime: '犯罪',
  travel: '旅行',
  thriller: '惊悚',
  healing: '治愈',
  mystery: '推理',
  japaneseLiterature: '日本文学',
  game: '游戏',
  danmei: '耽美',
  gourmet: '美食',
  ensembleCast: '群像',
  battleRoyale: '大逃杀',
  music: '音乐',
  fighting: '格斗',
  hotBlood: '热血',
  warm: '温馨',
  imaginative: '脑洞',
  villain: '恶役',
  jc: 'JC',
  spy: '谍战',
  sports: '竞技',
  otakuCulture: '宅文化',
  doujin: '同人'
};

const WENKU_PROGRESS_LABELS: Record<keyof typeof WENKU_PROGRESS, string> = {
  all: '不限',
  newUpload: '新书上传',
  developing: '情节展开',
  exciting: '精彩纷呈',
  closing: '接近尾声',
  completed: '已经完本'
};

const WENKU_ANIMATION_LABELS: Record<keyof typeof WENKU_ANIMATION, string> = {
  all: '不限',
  animated: '已动画化',
  notAnimated: '未动画化'
};

const WENKU_WORD_COUNT_LABELS: Record<keyof typeof WENKU_WORD_COUNT, string> = {
  all: '不限',
  under300k: '30万字以下',
  between300kAnd500k: '30-50万字',
  between500kAnd1m: '50-100万字',
  between1mAnd2m: '100-200万字',
  above2m: '200万字以上'
};

const WENKU_UPDATED_WITHIN_LABELS: Record<keyof typeof WENKU_UPDATED_WITHIN, string> = {
  all: '不限',
  threeDays: '三日内更新',
  sevenDays: '七日内更新',
  halfMonth: '半月内更新',
  oneMonth: '一月内更新'
};

const WENKU_CHANNEL_LABELS: Record<keyof typeof WENKU_CHANNEL, string> = {
  all: '不限'
};

const WENKU_INITIAL_LABELS: Record<keyof typeof WENKU_INITIAL, string> = {
  all: '不限'
};

export interface BilinovelFetchWenkuFilter {
  /**
   * 自定义路径, 优先使用; 例如 `lastupdate_0_0_0_0_0_0_0_1_0.html`
   */
  path?: string;

  /**
   * 排序方式, 如 lastupdate / postdate / weekvisit 等
   * @default WENKU_SORT.lastUpdate
   */
  sort?: WenkuSort;

  /**
   * 作品标签
   * @default WENKU_TAG.all
   */
  tag?: WenkuTag;

  /**
   * 写作进度
   * @default WENKU_PROGRESS.all
   */
  progress?: WenkuProgress;

  /**
   * 是否动画化
   * @default WENKU_ANIMATION.all
   */
  animation?: WenkuAnimation;

  /**
   * 文库地区
   * @default WENKU_REGION.all
   */
  region?: WenkuRegion;

  /**
   * 其他筛选槽位, 对应 URL 中第五段
   * @default WENKU_CHANNEL.all
   */
  channel?: WenkuChannel;

  /**
   * 书名前缀筛选, 对应 URL 中第六段
   * @default WENKU_INITIAL.all
   */
  initial?: WenkuInitial;

  /**
   * 字数筛选
   * @default WENKU_WORD_COUNT.all
   */
  wordCount?: WenkuWordCount;

  /**
   * 页码
   * @default 1
   */
  page?: number;

  /**
   * 更新时间范围
   * @default WENKU_UPDATED_WITHIN.all
   */
  updatedWithin?: WenkuUpdatedWithin;
}

export interface WenkuNovelItem {
  nid: number;
  title: string;
  cover?: string;
  author?: string;
  library?: string;
  status?: string;
  updatedAt: Date;
  description: string;
  tags: string[];
}

export interface WenkuPageResult {
  url: string;
  items: WenkuNovelItem[];
  pagination: {
    current: number;
    total?: number;
  };
  fetchedAt: Date;
}

export async function fetchWenkuPage(
  context: BrowserContext,
  filter: BilinovelFetchWenkuFilter = {},
  options?: BilinovelFetchOptions
): Promise<WenkuPageResult> {
  const page = await context.newPage();
  await blockRoutes(page);

  const target = buildWenkuURL(filter, options);

  await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });

  if (await isCloudflarePage(page)) {
    throw new Error(`"${target.toString()}" was blocked by cloudflare`);
  }

  const novels = await Promise.all(
    (await page.locator('.store_collist > .bookbox').all()).map(async (locator) => {
      const href = await locator.locator('.bookimg a').first().getAttribute('href');
      const nidMatch = href?.match(/\/novel\/(\d+)\.html/);
      const nid = nidMatch ? Number(nidMatch[1]) : 0;

      const title = (await locator.locator('.bookname').first().textContent())?.trim() || '';

      let cover =
        (await locator.locator('.bookimg img').first().getAttribute('data-original')) || undefined;

      if (cover && options?.transformImgSrc) {
        cover = applyTransformImgSrc(cover, options.transformImgSrc);
      }

      const info = await locator.locator('.bookilnk span').allTextContents();
      const [author, library, status, updatedAtStr] = info.map((text) => text.trim());

      const description = (
        (await locator.locator('.bookintro').first().textContent()) || ''
      ).trim();

      const tagsText = (
        (await locator.locator('.bookupdate b').first().textContent()) || ''
      ).trim();
      const tags = tagsText
        .split(/\s+/)
        .map((tag) => tag.trim())
        .filter(Boolean);

      const updatedAt = updatedAtStr ? parseShanghaiDateTime(updatedAtStr) : undefined;

      return {
        nid,
        title,
        cover,
        author,
        library,
        status,
        updatedAt: updatedAt!,
        description,
        tags
      };
    })
  );

  const items = novels.filter((item) => item.nid && item.title && item.updatedAt);

  const statsText = await page.locator('#pagestats').first().textContent();
  let currentPage = filter.page ?? 1;
  let totalPages: number | undefined;
  if (statsText) {
    const match = statsText.trim().match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      currentPage = Number(match[1]);
      totalPages = Number(match[2]) || undefined;
    }
  }

  return {
    url: target.toString(),
    items,
    pagination: {
      current: currentPage,
      total: totalPages
    },
    fetchedAt: new Date()
  };
}

type WenkuFilterQueryValue = string | number | boolean | null | undefined;
type WenkuFilterQueryInput =
  | string
  | URL
  | URLSearchParams
  | Record<string, WenkuFilterQueryValue | WenkuFilterQueryValue[]>;

export function parseWenkuFilter(input: WenkuFilterQueryInput): BilinovelFetchWenkuFilter {
  const searchParams = getSearchParams(input);
  const filter: BilinovelFetchWenkuFilter = {};

  const path = searchParams.get('path')?.trim();
  if (path) filter.path = path;

  const sort = parseMappedParam(WENKU_SORT, searchParams.get('sort'));
  if (sort !== undefined) filter.sort = sort;

  const tag = parseMappedParam(WENKU_TAG, searchParams.get('tag'));
  if (tag !== undefined) filter.tag = tag;

  const progress = parseMappedParam(WENKU_PROGRESS, searchParams.get('progress'));
  if (progress !== undefined) filter.progress = progress;

  const animation = parseMappedParam(WENKU_ANIMATION, searchParams.get('animation'));
  if (animation !== undefined) filter.animation = animation;

  const region = parseMappedParam(WENKU_REGION, searchParams.get('region'));
  if (region !== undefined) filter.region = region;

  const channel = parseMappedParam(WENKU_CHANNEL, searchParams.get('channel'));
  if (channel !== undefined) filter.channel = channel;

  const initial = parseMappedParam(WENKU_INITIAL, searchParams.get('initial'));
  if (initial !== undefined) filter.initial = initial;

  const wordCount = parseMappedParam(WENKU_WORD_COUNT, searchParams.get('wordCount'));
  if (wordCount !== undefined) filter.wordCount = wordCount;

  const page = parsePositiveInteger(searchParams.get('page'));
  if (page !== undefined) filter.page = page;

  const updatedWithin = parseMappedParam(WENKU_UPDATED_WITHIN, searchParams.get('updatedWithin'));
  if (updatedWithin !== undefined) filter.updatedWithin = updatedWithin;

  return filter;
}

export function formatWenkuFilterTitle(filter: BilinovelFetchWenkuFilter): string {
  const parsedFromPath = filter.path ? parseWenkuPathFilter(filter.path) : undefined;
  if (filter.path && !parsedFromPath) return filter.path;

  const target = parsedFromPath ? { ...filter, ...parsedFromPath } : filter;

  const sortKey = resolveMappedKey(WENKU_SORT, target.sort, 'lastUpdate');
  const tagKey = resolveMappedKey(WENKU_TAG, target.tag, 'all');
  const progressKey = resolveMappedKey(WENKU_PROGRESS, target.progress, 'all');
  const animationKey = resolveMappedKey(WENKU_ANIMATION, target.animation, 'all');
  const regionKey = resolveMappedKey(WENKU_REGION, target.region, 'all');
  const channelKey = resolveMappedKey(WENKU_CHANNEL, target.channel, 'all');
  const initialKey = resolveMappedKey(WENKU_INITIAL, target.initial, 'all');
  const wordCountKey = resolveMappedKey(WENKU_WORD_COUNT, target.wordCount, 'all');
  const updatedWithinKey = resolveMappedKey(WENKU_UPDATED_WITHIN, target.updatedWithin, 'all');

  const parts = [WENKU_SORT_LABELS[sortKey] ?? String(sortKey)];

  if (tagKey !== 'all') parts.push(`${WENKU_TAG_LABELS[tagKey]}`);
  if (animationKey !== 'all') parts.push(`${WENKU_ANIMATION_LABELS[animationKey]}`);
  if (channelKey !== 'all') parts.push(`${WENKU_CHANNEL_LABELS[channelKey]}`);
  if (initialKey !== 'all') parts.push(`${WENKU_INITIAL_LABELS[initialKey]}`);
  if (wordCountKey !== 'all') parts.push(`${WENKU_WORD_COUNT_LABELS[wordCountKey]}`);
  if (progressKey !== 'all') parts.push(`${WENKU_PROGRESS_LABELS[progressKey]}`);
  if (updatedWithinKey !== 'all') parts.push(`${WENKU_UPDATED_WITHIN_LABELS[updatedWithinKey]}`);

  if (regionKey !== 'all') parts.push(`${WENKU_REGION_LABELS[regionKey]}`);
  else parts.push('轻小说');

  return '哔哩轻小说 ' + parts.join(' · ');
}

function parseWenkuPathFilter(path: string): BilinovelFetchWenkuFilter | undefined {
  let input = path.trim();
  if (!input) return undefined;

  const queryIndex = input.indexOf('?');
  if (queryIndex >= 0) {
    input = input.slice(0, queryIndex);
  }

  try {
    const url = new URL(input, input.includes('://') ? undefined : 'https://example.com');
    input = url.pathname;
  } catch {
    // ignore invalid url
  }

  input = input.replace(/^\/+/, '').replace(/\.html?$/, '');
  if (input.startsWith('wenku/')) {
    input = input.slice('wenku/'.length);
  }

  const parts = input.split('_');
  if (parts.length !== 10 || !parts[0]) return undefined;

  const [sort, tag, progress, animation, region, channel, initial, wordCount, page, updatedWithin] =
    parts;

  const parseNumber = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const parsedPage = parsePositiveInteger(page);

  const parsed: BilinovelFetchWenkuFilter = {
    sort: sort as WenkuSort,
    tag: (parseNumber(tag) ?? tag) as WenkuTag,
    progress: (parseNumber(progress) ?? progress) as WenkuProgress,
    animation: (parseNumber(animation) ?? animation) as WenkuAnimation,
    region: (parseNumber(region) ?? region) as WenkuRegion,
    channel: (parseNumber(channel) ?? channel) as WenkuChannel,
    initial: (parseNumber(initial) ?? initial) as WenkuInitial,
    wordCount: (parseNumber(wordCount) ?? wordCount) as WenkuWordCount,
    updatedWithin: (parseNumber(updatedWithin) ?? updatedWithin) as WenkuUpdatedWithin
  };

  if (parsedPage !== undefined) {
    parsed.page = parsedPage;
  }

  return parsed;
}

function buildWenkuURL(filter: BilinovelFetchWenkuFilter, options?: BilinovelFetchOptions) {
  const baseURL = options?.baseURL || 'https://www.linovelib.com/';

  if (filter.path) {
    const pathname = filter.path.startsWith('/wenku')
      ? filter.path
      : `/wenku/${filter.path.replace(/^\//, '')}`;
    return new URL(pathname, baseURL);
  }

  const sort = resolveMappedValue(WENKU_SORT, filter.sort, 'lastUpdate');

  const segments = [
    resolveMappedValue(WENKU_TAG, filter.tag, 'all'),
    resolveMappedValue(WENKU_PROGRESS, filter.progress, 'all'),
    resolveMappedValue(WENKU_ANIMATION, filter.animation, 'all'),
    resolveMappedValue(WENKU_REGION, filter.region, 'all'),
    resolveMappedValue(WENKU_CHANNEL, filter.channel, 'all'),
    resolveMappedValue(WENKU_INITIAL, filter.initial, 'all'),
    resolveMappedValue(WENKU_WORD_COUNT, filter.wordCount, 'all'),
    filter.page ?? 1,
    resolveMappedValue(WENKU_UPDATED_WITHIN, filter.updatedWithin, 'all')
  ];

  return new URL(`/wenku/${sort}_${segments.join('_')}.html`, baseURL);
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
  input: string | null
): keyof T | T[keyof T] | undefined {
  if (input === null) return undefined;
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

function getSearchParams(input: WenkuFilterQueryInput) {
  if (input instanceof URLSearchParams) return input;
  if (input instanceof URL) return input.searchParams;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('?')) return new URLSearchParams(trimmed.slice(1));
    try {
      const url = new URL(trimmed, trimmed.includes('://') ? undefined : 'https://example.com');
      if (url.search || trimmed.includes('?') || !trimmed.includes('=')) {
        return url.searchParams;
      }
    } catch {
      // ignore and fallback to parsing as query string
    }
    return new URLSearchParams(trimmed);
  }

  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const list = Array.isArray(value) ? value : [value];
    list.forEach((item) => params.append(key, String(item)));
  });
  return params;
}
