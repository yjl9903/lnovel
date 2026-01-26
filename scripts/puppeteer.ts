import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import {
  type BilinovelFetch,
  fetchNovelPage,
  fetchNovelVolumePage,
  fetchNovelChapterPages
} from '../packages/bilinovel/src/index';

interface ScrapelessOptions {
  /**
   * API Token
   */
  token: string;

  /**
   * 单位: 秒
   */
  sessionTTL?: number;
}

const connectScrapeless = async (options: ScrapelessOptions) => {
  const query = new URLSearchParams({
    token: options.token,
    proxyCountry: 'US',
    proxyState: 'CA',
    proxyCity: 'los_angeles',
    sessionTTL: String(options.sessionTTL ?? 60 * 5)
  });

  const connectionURL = `wss://browser.scrapeless.com/api/v2/browser?${query.toString()}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: connectionURL,
    defaultViewport: null
  });

  return browser;
};

interface BrowserFetcherOptions {
  scrapeless: ScrapelessOptions;

  delay?: {};
}

function createBilinovelFetch(options: BrowserFetcherOptions): {
  fetch: BilinovelFetch;
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
} {
  const { scrapeless } = options;

  let first = true;
  let browser: Promise<Browser> | undefined = undefined;

  const connect = async (): Promise<Browser> => {
    if (browser) await close();
    return (browser = connectScrapeless(scrapeless));
  };

  const close = async () => {
    if (!browser) return;
    try {
      await (await browser).close();
    } catch {
      // ignore error
    } finally {
      browser = undefined;
    }
  };

  const newPage = async () => {
    if (!browser) {
      browser = connect();
    } else if (!(await browser).connected) {
      browser = connect();
    }

    try {
      const page = await (await browser).newPage();
      first = true;
      return page;
    } catch {
      browser = connect();
      const page = await (await browser).newPage();
      first = true;
      return page;
    }
  };

  return {
    fetch: async (pathname, options) => {
      let page = await newPage();

      const url = new URL(pathname, 'https://www.linovelib.com');

      const filename = pathname
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/\.html$/, '.png')
        .replace('catalog', 'catalog.png');

      const MAX_RETRY = 3;
      for (let turn = 0; turn < MAX_RETRY; turn++) {
        try {
          if (page.isClosed()) {
            page = await newPage();
          }

          if (first) {
            first = false;
          } else {
            await new Promise((res) => setTimeout(res, 5 * 1000));
          }

          console.log('Navigate to URL', url.toString());

          await page.goto(url.toString(), { timeout: 60 * 1000, waitUntil: 'domcontentloaded' });

          console.log('Waiting for challenge');

          if (options?.selector) {
            await page.waitForSelector(options.selector);
          }

          console.log('Navigate OK', url.toString());

          // Screenshot for debugging
          await fs.mkdir('.screenshot').catch(() => {});

          await page.screenshot({
            path: path.join('./.screenshot', filename),
            fullPage: true
          });

          const content = await page.content();

          // HTML assets
          await fs.writeFile(
            path.join('./.screenshot', filename.replace(/\.png/, '.html')),
            content,
            'utf-8'
          );

          return content;
        } catch (error) {
          console.error(error);

          await fs.mkdir('.screenshot').catch(() => {});

          await page
            .screenshot({
              path: path.join('./.screenshot', filename),
              fullPage: true
            })
            .catch(() => {});

          if (turn + 1 === MAX_RETRY) {
            throw error;
          }

          // 重新连接浏览器
          await new Promise((res) => setTimeout(res, 10 * 1000));

          await close();
          page = await newPage();
        }
      }

      throw new Error('unreachable');
    },
    newPage,
    close
  };
}

const { fetch: fetchHTML, close } = createBilinovelFetch({
  scrapeless: {
    token: process.env.SCRAPELESS_TOKEN!
  }
});

const nid = 1410;
const novel = await fetchNovelPage(fetchHTML, nid, { transformImgSrc });

console.log(novel);

for (const vol of novel?.volumes ?? []) {
  const vid = vol.vid;
  const volume = await fetchNovelVolumePage(fetchHTML, nid, vid, { transformImgSrc });

  console.log(volume);

  if (!volume) continue;

  await fs.mkdir(`.data/${volume.name}`, { recursive: true }).catch(() => {});

  for (const ch of volume.chapters) {
    const cid = ch.cid;

    const chapter = await fetchNovelChapterPages(fetchHTML, nid, cid, {
      transformBbcode: true,
      transformImgSrc
    });

    if (chapter) {
      const content = `<?xml version='1.0' encoding='utf-8'?>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh" xml:lang="zh"><head>
      <title>${chapter.title}</title>
    </head>
    <body>
    <h1>${chapter.title}</h1>
    ${chapter.content}
    </body></html>`;

      await fs.writeFile(`./.data/${volume.name}/${chapter.title}.html`, content, 'utf-8');
    }
  }
}

function transformImgSrc(_url: string) {
  try {
    if (_url.startsWith('/files/')) {
      _url = 'https://www.linovelib.com' + _url;
    }

    const url = new URL(_url);
    if (url.host === 'img3.readpai.com') {
      return `https://lnovel.animes.garden/bili/img3${url.pathname}${url.search}`;
    }
    if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
      return `https://lnovel.animes.garden/bili${url.pathname}${url.search}`;
    }
    return _url;
  } catch (error) {
    return _url;
  }
}

await close();
