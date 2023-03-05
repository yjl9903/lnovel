export abstract class LightNovelProvider {
  public static async init() {}

  abstract search(key: string, options?: Partial<SearchOption>): Promise<SearchResult[]>;

  abstract fetch(key: string): Promise<void>;

  public async promptSearch(list: SearchResult[]): Promise<SearchResult | undefined> {
    const inquirer = (await import('inquirer')).default;
    const { selected } = await inquirer.prompt({
      type: 'list',
      name: 'selected',
      message: '选择你想要的轻小说?',
      choices: list.map((r) => ({ name: r.name, value: r }))
    });
    return selected;
  }
}

export interface SearchOption {
  type: 'name' | 'author';
}

export interface SearchResult {
  id: string;

  name: string;

  href: string;

  meta?: Record<string, any>;
}
