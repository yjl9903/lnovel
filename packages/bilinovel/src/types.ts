export interface BilinovelFetchOptions {
  /**
   * @default 'https://www.linovelib.com/'
   */
  baseURL?: string;
}

export interface BilinovelFetchChapterOptions extends BilinovelFetchOptions {
  /**
   * [ruby=tsuku]小[/ruby][ruby=chan]月[/ruby]
   */
  transformRuby?: boolean;

  /**
   * 请求延迟
   */
  delay?: number;
}
