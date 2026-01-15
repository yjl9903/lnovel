export abstract class LightNovelProvider {
  public static async init() {}

  abstract search(key: string, options?: Partial<SearchOption>): Promise<SearchResult[]>;

  abstract fetch(result: SearchResult): Promise<LightNovel>;

  abstract download(novel: LightNovel, volume: Volume, option: DownloadOption): Promise<Book>;
}

export interface SearchOption {
  type: 'name' | 'author';
}

export interface DownloadOption {
  outDir: string;

  force: boolean;
}

export interface SearchResult {
  id: string;

  name: string;

  href: string;

  meta?: Record<string, any>;
}

export interface LightNovel {
  id: string;

  name: string;

  href: string;

  /**
   * 封面
   */
  cover: string;

  /**
   * 作者
   */
  author: string;

  /**
   * 文库
   */
  publisher: string;

  /**
   * 是否完结
   */
  status: string;

  /**
   * 最后更新时间
   */
  lastUpdateTime: Date;

  /**
   * 小说标签
   */
  tags: string[];

  /**
   * 内容简介
   */
  description: string;

  volumes: Volume[];

  meta?: Record<string, any>;
}

export interface Volume {
  id: string;

  name: string;

  chapter: Chapter[];

  href?: string;
}

export interface Chapter {
  index: number;

  title: string;

  href: string;
}

export interface Book {
  root: string;

  novel: LightNovel;

  volume: Volume;

  contents: Array<Chapter & { content: string }>;

  cover?: string;

  images: string[];
}
