import { Volume } from '../base';
import type { Chapter, LightNovel } from '../base';

import { fetch } from './fetch';

const BASE_URL = 'https://www.wenku8.net';

/**
 * 获取小说详细信息
 * @param novelId
 * @returns
 */
export async function getNovelDetails(id: string): Promise<LightNovel> {
  const url = `${BASE_URL}/book/${id}.htm`;
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
    volumes: await getChapterList(fixURL(catalogueUrl)!),
    meta: {
      length,
      recentChapter
    }
  };

  function fixURL(url: string | undefined) {
    if (url === undefined) {
      return undefined;
    } else if (url.startsWith('https://')) {
      return url;
    } else {
      return BASE_URL + (url.startsWith('/') ? '' : '/') + url;
    }
  }

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
              title: replaceTitle(chapterTitle),
              href: url.replace(/index\.htm$/, chapterUrl)
            });
          }
        });
    }

    return volumes.map((v) => ({
      id: String(v.index),
      name: replaceTitle(v.name),
      chapter: v.chapter
    }));
  }
}

function replaceTitle(title: string) {
  return title
    .replace('一', '1')
    .replace('二', '2')
    .replace('三', '3')
    .replace('四', '4')
    .replace('五', '5')
    .replace('六', '6')
    .replace('七', '7')
    .replace('八', '8')
    .replace('九', '9')
    .replace('零', '0')
    .replace(/十(\d)/, '1$1')
    .replace('十', '10');
}
