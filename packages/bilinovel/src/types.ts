import type { Page } from 'playwright';

export type BilinovelFetch = (
  path: string,
  query?: Record<string, string | number | undefined>
) => Promise<string>;

export type Fetcher = BilinovelFetch;

export interface BilinovelFetchOptions {
  /**
   * @default 'https://www.linovelib.com/'
   */
  baseURL?: string;

  /**
   * <img src="..." />
   */
  transformImgSrc?: string | ((url: string) => string | undefined | null);

  /**
   * logger
   */
  logger?: Pick<typeof console, 'log' | 'info' | 'warn' | 'error'>;

  /**
   * Post-mortem debugging
   */
  postmortem?: (page: Page) => void | Promise<void>;
}

export interface BilinovelFetchNovelOptions extends BilinovelFetchOptions {}

export interface BilinovelFetchNovelVolumeOptions extends BilinovelFetchOptions {
  /**
   * <img src="..." />
   */
  transformImgSrc?: string | ((url: string) => string | undefined | null);
}

export interface BilinovelFetchChapterOptions extends BilinovelFetchOptions {
  /**
   * BBCode 转 HTML
   */
  transformBbcode?: boolean;

  /**
   * <img src="..." />
   */
  transformImgSrc?: string | ((url: string) => string | undefined | null);

  /**
   * 请求延迟
   */
  delay?: number;
}
