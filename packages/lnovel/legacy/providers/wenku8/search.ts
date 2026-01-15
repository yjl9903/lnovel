import iconv from 'iconv-lite';

import type { SearchResult } from '../base';

import { fetch } from './fetch';
import { extractIdFromUrl } from './utils';

/**
 * 根据小说名称或者作者名称，获取到小说列表
 */
export async function doSearch(
  search: string,
  type: 'articlename' | 'author' = 'articlename'
): Promise<SearchResult[]> {
  const searchKey = [...iconv.encode(search, 'gbk')].map((i) => `%${i.toString(16)}`).join('');
  const $ = await fetch(
    `https://www.wenku8.net/modules/article/search.php?searchtype=${type}&searchkey=${searchKey}`
  );

  const catalogueUrl = $('#content')
    .children()
    .first()
    .children()
    .eq(5)
    .children()
    .children()
    .first()
    .find('a')
    .attr('href');

  if (catalogueUrl) {
    const name = $('#content')
      .children()
      .first()
      .children()
      .first()
      .find('table tbody tr td span b')
      .text();

    return [{ name, id: catalogueUrl.match(/(\d+)\/index\.htm$/)![1], href: catalogueUrl }];
  }

  return $('tbody tr td')
    .children()
    .map((_i, item) => {
      const name = $(item).find('b a').attr('title') ?? $(item).find('b').text();
      const href = $(item).find('b a').attr('href')!;
      const novelId = extractIdFromUrl(href as Parameters<typeof extractIdFromUrl>[0]);
      return <SearchResult>{
        name,
        id: '' + novelId,
        href
      };
    })
    .get();
}
