export interface BilinovelFetchOptions {
  /**
   * @default 'https://www.linovelib.com/'
   */
  baseURL?: string;
}

export interface BilinovelFetchNovelOptions extends BilinovelFetchOptions {
  /**
   * <img src="..." />
   */
  transformImgSrc?: string | ((url: string) => string | undefined | null);
}

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
