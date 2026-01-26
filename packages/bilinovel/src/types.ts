export interface BilinovelFetchInit {
  /**
   * Wait for selector active
   */
  selector?: string;
}

export type BilinovelFetch = (path: string, init?: BilinovelFetchInit) => Promise<string>;

export interface BilinovelFetchPageOptions {
  /**
   * <img src="..." />
   */
  transformImgSrc?: string | ((url: string) => string | undefined | null);

  /**
   * logger
   */
  logger?: Pick<typeof console, 'log' | 'info' | 'warn' | 'error'>;
}

export interface BilinovelFetchNovelOptions extends BilinovelFetchPageOptions {}

export interface BilinovelFetchNovelVolumeOptions extends BilinovelFetchPageOptions {}

export interface BilinovelFetchNovelChapterOptions extends BilinovelFetchPageOptions {
  /**
   * BBCode 转 HTML
   */
  transformBbcode?: boolean;
}
