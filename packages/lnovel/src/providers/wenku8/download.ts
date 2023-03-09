import * as fs from 'node:fs';
import * as path from 'node:path';

import ora from 'ora';
import axios from 'axios';
import death from 'death';
import iconv from 'iconv-lite';
import pLimit from 'p-limit';

import { parse, stringify } from 'yaml';

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
  const imageRoot = path.join(root, 'images');
  if (!fs.existsSync(imageRoot)) {
    fs.mkdirSync(imageRoot);
  }
  const novelPath = path.join(root, 'novel.yaml');

  const limit = pLimit(5);
  const contents = volume.chapter.map(() => undefined as Book['contents'][0] | undefined);
  const imageSet = new Set<string>();

  const tasks = volume.chapter.map((chapter, index) => {
    return limit(async () => {
      const localPath = path.join(root, `${chapter.index}-${chapter.title}.md`);
      if (!options.force && fs.existsSync(localPath)) {
        const content = await fs.promises.readFile(localPath, 'utf-8');
        contents[index] = { ...chapter, content };
      }

      spinner.start(`正在下载 ${novel.name} ${volume.name} ${chapter.title}`);
      try {
        const resp = await downloadChapter(chapter.href);
        const content = resp.content;
        contents[index] = { ...chapter, content };
        resp.images.forEach((i) => imageSet.add(i));
        await fs.promises.writeFile(localPath, content, 'utf-8');
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

  let cover: string | undefined = undefined;
  const imageTasks = [...imageSet.values()].map((image) => {
    return limit(async () => {
      const imageName = image.slice(image.lastIndexOf('/'));
      const localPath = path.join(imageRoot, imageName);
      if (!options.force && fs.existsSync(localPath)) {
        return;
      }

      spinner.start(`正在下载插图 ${image}`);
      for (let i = 0; i < 10; i++) {
        try {
          const resp = await axios.get(image, { responseType: 'arraybuffer' });
          await fs.promises.writeFile(localPath, resp.data);
          spinner.succeed(`完成下载 ${image}`);
          return path.relative(root, localPath);
        } catch {}
      }
      spinner.fail();

      return undefined;
    });
  });

  const localImages = [] as string[];
  if (!options.force && fs.existsSync(novelPath)) {
    const config = parse(fs.readFileSync(novelPath, 'utf-8'));
    cover = config.cover;
    localImages.push(...config.images);
  } else {
    localImages.push(...((await Promise.all(imageTasks)).filter(Boolean) as string[]));

    for (const image of localImages) {
      const sizeOf = (await import('image-size')).default;
      const size = sizeOf(path.join(root, image));
      if (size.height && size.width) {
        if (size.height >= size.width) {
          cover = image;
          break;
        }
      } else {
        cover = image;
        break;
      }
    }

    await fs.promises.writeFile(
      novelPath,
      stringify({ novel: { ...novel, volumes: undefined }, volume, cover, images: localImages }),
      'utf-8'
    );
  }

  limit.clearQueue();
  spinner.stop();
  cancel();

  return {
    root,
    novel,
    volume,
    contents: contents as Book['contents'],
    cover,
    images: localImages
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
          ?.replaceAll('&nbsp;', '')
          .replaceAll(
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
        content = iconv.decode(res.data, 'utf-8').replace('&nbsp;', '');
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

  const content = (
    $('#content')
      .html()
      ?.replaceAll('<ul id="contentdp">本文来自 轻小说文库(http://www.wenku8.com)</ul>', '')
      .replaceAll('本文来自 轻小说文库(http://www.wenku8.com)', '')
      .replaceAll('台版 转自 轻之国度', '')
      .replaceAll('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', '')
      .replaceAll('<ul id="contentdp"></ul>', '')
      .replaceAll(/http:\/\/pic\.wenku8\.com\/pictures\/\d+\/\d+\/\d+/g, '__IMAGE_ROOT__')
      .replaceAll('&nbsp;', '')
      .replaceAll('<br>', '<br/>') ?? ''
  ).trim();

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
