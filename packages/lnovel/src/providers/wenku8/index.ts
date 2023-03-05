/**
 * This module is migrated from https://github.com/Messiahhh/wenku8-downloader
 */

import ora from 'ora';

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
    const spinner = ora();
    spinner.start(`正在搜索${name}...`);

    try {
      const { doSearch } = await import('./search');
      return await doSearch(name, type === 'name' ? 'articlename' : 'author');
    } finally {
      spinner.succeed();
      console.log();
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
