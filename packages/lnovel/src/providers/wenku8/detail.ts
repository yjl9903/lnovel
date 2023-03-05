import type { LightNovel } from '../base';

import { fetch } from './fetch';

const BASE_URL = 'https://www.wenku8.net/book/';

/**
 * 获取小说详细信息
 * @param novelId
 * @returns
 */
export async function getNovelDetails(id: string): Promise<LightNovel> {
  const $ = await fetch(`${BASE_URL}${id}.htm`);

  const name = $('#content')
    .children()
    .first()
    .children()
    .first()
    .find('table tbody tr td span b')
    .text();
  const [publisher, author, status, lastUpdateTime, length] = $('#content')
    .children()
    .first()
    .children()
    .first()
    .children()
    .first()
    .children()
    .eq(1)
    .children()
    .map((i, item) => {
      return $(item)
        .text()
        .match(/：(.+)$/)![1];
    })
    .get();
  const cover = $('#content')
    .children()
    .first()
    .children()
    .eq(3)
    .find('table tbody tr td img')
    .attr('src')!;
  const centerEl = $('#content')
    .children()
    .first()
    .children()
    .eq(3)
    .find('table tbody tr td')
    .eq(1);
  const tag = centerEl
    .find('span')
    .first()
    .text()
    .match(/：(.+)$/)![1];
  const recentChapter = centerEl.find('span').eq(3).text();
  const description = centerEl.find('span').last().text();
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

  return {
    id,
    name,
    cover,
    publisher,
    author,
    status,
    lastUpdateTime: new Date(lastUpdateTime),
    tags: tag.split(' '),
    description: description
      .split('\n')
      .map((l) => l.trim())
      .join('\n'),
    href: catalogueUrl!,
    meta: {
      length,
      recentChapter
    }
  };
}
