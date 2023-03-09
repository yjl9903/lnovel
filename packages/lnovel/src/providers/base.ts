export abstract class LightNovelProvider {
  public static async init() {}

  abstract search(key: string, options?: Partial<SearchOption>): Promise<SearchResult[]>;

  abstract fetch(result: SearchResult): Promise<LightNovel>;

  abstract download(novel: LightNovel, volume: Volume, option: DownloadOption): Promise<Book>;

  public async promptSelect(list: SearchResult[]): Promise<SearchResult | undefined> {
    const inquirer = (await import('inquirer')).default;
    const { selected } = await inquirer.prompt({
      type: 'list',
      name: 'selected',
      message: '选择你想要的轻小说?',
      choices: list.map((r) => ({ name: r.name, value: r })),
      pageSize: 10
    });
    return selected;
  }

  public async promptSelectVolume(novel: LightNovel): Promise<Volume[] | undefined> {
    const inquirer = (await import('inquirer')).default;
    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: '选择你想要的卷数?',
      choices: novel.volumes.map((r) => ({ name: r.name, value: r })),
      default: novel.volumes,
      loop: false,
      pageSize: 10
    });
    return selected;
  }

  public async promptConfirm(): Promise<boolean> {
    const inquirer = (await import('inquirer')).default;
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: '确认开始下载?'
    });
    return confirm;
  }
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
