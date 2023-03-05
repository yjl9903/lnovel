/**
 * This module is migrated from https://github.com/Messiahhh/wenku8-downloader
 */

import { LightNovelProvider, SearchOption, SearchResult } from '../base';

import { getCookie } from './fetch';

export class Wenku8Provider extends LightNovelProvider {
  public static async init() {
    await getCookie();
  }

  public async search(
    name: string,
    { type = 'name' }: Partial<SearchOption> = {}
  ): Promise<SearchResult[]> {
    const { doSearch } = await import('./search');

    return doSearch(name, type === 'name' ? 'articlename' : 'author');
  }

  public fetch(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
