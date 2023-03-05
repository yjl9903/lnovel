import { Volume } from './../base';
import type { Chapter, LightNovel } from '../base';

import { fetch } from './fetch';

const BASE_URL = 'https://www.wenku8.net/book/';

/**
 * 获取小说详细信息
 * @param novelId
 * @returns
 */
export async function getNovelDetails(id: string): Promise<LightNovel> {
  const url = `${BASE_URL}${id}.htm`;
  const $ = await fetch(url);

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
    volumes: await getChapterList(catalogueUrl!),
    meta: {
      length,
      recentChapter
    }
  };

  async function getChapterList(url: string): Promise<Volume[]> {
    const $ = await fetch(url);
    const rows = $('tbody').children();

    const volumes = $('table tbody tr td.vcss')
      .map((index, item) => ({
        index,
        name: $(item).text().trim(),
        chapter: [],
        rowNumber: $(item).parent().index()
      }))
      .get();

    for (let i = 0; i < volumes.length; i++) {
      const v = volumes[i];
      const chapters = v.chapter as Chapter[];
      rows
        .slice(
          volumes[i].rowNumber,
          i + 1 < volumes.length ? volumes[i + 1].rowNumber : rows.length
        )
        .find('a')
        .each((chapterIndex, item) => {
          const chapterTitle = $(item).text();
          const chapterUrl = $(item).attr('href');
          if (chapterUrl) {
            chapters.push({
              index: chapterIndex + 1,
              title: chapterTitle,
              href: chapterUrl
            });
          }
        });
    }

    return volumes.map((v) => ({ id: v.id, name: v.name, chapter: v.chapter }));
  }
}
