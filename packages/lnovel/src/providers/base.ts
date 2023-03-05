export abstract class LightNovelProvider {
  public static async init() {}

  abstract search(key: string, options: SearchOption): Promise<void>;

  abstract fetch(key: string): Promise<void>;
}

export interface SearchOption {}
