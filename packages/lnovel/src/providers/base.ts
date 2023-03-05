export abstract class LightNovelProvider {
  public static async init() {}

  abstract search(key: string, options?: Partial<SearchOption>): Promise<SearchResult[]>;

  abstract fetch(key: string): Promise<void>;
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
