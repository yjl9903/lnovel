/**
 * This module is migrated from https://github.com/Messiahhh/wenku8-downloader
 */

import { spinner } from '@clack/prompts';

import {
  LightNovelProvider,
  SearchOption,
  DownloadOption,
  SearchResult,
  LightNovel,
  Book,
  Volume
} from '../base';

import { getCookie } from './fetch';

export class Wenku8Provider extends LightNovelProvider {
  public static async init() {
    await getCookie();
  }

  public async search(
    name: string,
    { type = 'name' }: Partial<SearchOption> = {}
  ): Promise<SearchResult[]> {
    const spin = spinner();
    spin.start(`正在搜索${name}...`);

    try {
      const { doSearch } = await import('./search');
      const result = await doSearch(name, type === 'name' ? 'articlename' : 'author');
      spin.stop(`搜索到 ${result.length} 本相关的轻小说`);
      return result;
    } catch {
      spin.stop('搜索失败');
      process.exit(1);
    }
  }

  public async fetch(result: SearchResult): Promise<LightNovel> {
    const { getNovelDetails } = await import('./detail');
    return await getNovelDetails(result.id);
  }

  public async download(novel: LightNovel, volume: Volume, options: DownloadOption): Promise<Book> {
    const { doDownload } = await import('./download');
    return doDownload(novel, volume, options);
  }
}
