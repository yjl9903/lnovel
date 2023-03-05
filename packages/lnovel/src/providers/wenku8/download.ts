import * as fs from 'node:fs';
import * as path from 'node:path';

import ora from 'ora';
import axios from 'axios';
import death from 'death';
import pLimit from 'p-limit';
import iconv from 'iconv-lite';

import { DownloadOption, LightNovel, Volume, Book } from '../base';
import { fetch } from './fetch';

const spinner = ora();

export async function doDownload(
  novel: LightNovel,
  volume: Volume,
  options: DownloadOption
): Promise<Book> {
  const root = path.join(options.outDir, novel.name, volume.name);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  const limit = pLimit(5);
  const contents = volume.chapter.map(() => undefined as Book['contents'][0] | undefined);

  const tasks = volume.chapter.map((chapter, index) => {
    return limit(async () => {
      spinner.start(`正在下载 ${novel.name} ${volume.name} ${chapter.title}`);
      try {
        const content = await downloadChapter(chapter.href);
        contents[index] = { ...chapter, content: content.content ?? '' };
        await fs.promises.writeFile(
          path.join(root, `${chapter.index}-${chapter.title}.md`),
          content.content ?? '',
          'utf-8'
        );
        spinner.succeed(`完成下载 ${novel.name} ${volume.name} ${chapter.title}`);
      } catch (err) {
        spinner.fail();
      }
      return undefined;
    });
  });

  const cancel = death(() => {
    limit.clearQueue();
    spinner.stop();
  });

  await Promise.all(tasks);
  limit.clearQueue();
  spinner.stop();
  cancel();

  return {
    novel,
    volume,
    contents: contents as Book['contents'],
    images: []
  };
}

/**
 * 下载某一章节
 * @param chapterUrl
 * @returns
 */
async function downloadChapter(chapterUrl: string) {
  const $ = await fetch(chapterUrl);
  if ($('#contentmain span').first().text().trim() == 'null') {
    // for: 因版权问题，文库不再提供该小说的阅读！
    let content = '';
    const v = chapterUrl.substring(0, chapterUrl.lastIndexOf('.')).split('/');

    try {
      const $ = await fetch(
        `http://dl.wenku8.com/pack.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`,
        'utf-8'
      );
      content =
        $('body')
          .html()
          ?.replace('&nbsp;', '')
          .replace(
            '更多精彩热门日本轻小说、动漫小说，轻小说文库(http://www.wenku8.com) 为你一网打尽！',
            ''
          ) || '';
    } catch (error: any) {
      if (error.message.indexOf('404') !== -1) {
        const res = await axios.get(
          `http://dl.wenku8.com/packtxt.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`,
          {
            responseType: 'arraybuffer'
          }
        );
        content = iconv.decode(res.data, 'utf-8');
      }
    }

    const picReg = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg/g;
    const picRegL = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg\([0-9]+K\)/g;
    const images = content.match(picReg) ?? [];
    content = content.replace(picRegL, '');
    return {
      content,
      images
    };
  }

  const content = $('#content')
    .html()
    ?.replace('本文来自 轻小说文库(http://www.wenku8.com)', '')
    .replace('台版 转自 轻之国度', '')
    .replace('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', '');

  const images = $('img')
    .map(function (i, imgEle: any) {
      const src = imgEle.attribs.src;
      return src;
    })
    .get();

  return {
    content,
    images
  };
}
