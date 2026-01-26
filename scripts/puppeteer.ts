import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';

import puppeteer from 'puppeteer-core';

import {
  fetchNovelPage,
  fetchNovelVolumePage,
  fetchNovelChapterPages
} from '../packages/bilinovel/src/index';

const query = new URLSearchParams({
  token: process.env.SCRAPELESS_TOKEN || '',
  proxyCountry: 'US',
  proxyState: 'CA',
  proxyCity: 'los_angeles',
  sessionTTL: '900'
});

const connectionURL = `wss://browser.scrapeless.com/api/v2/browser?${query.toString()}`;

const browser = await puppeteer.connect({
  browserWSEndpoint: connectionURL,
  defaultViewport: null
});

async function fetchHTML(pathname: string, query?: Record<string, string | number | undefined>) {
  const page = await browser.newPage();

  const url = new URL(pathname, 'https://www.linovelib.com');
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value || ''));
  }

  // Screenshot for debugging
  const filename = pathname
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/\.html$/, '.png')
    .replace('catalog', 'catalog.png');

  console.log('Navigate to URL', url.toString());

  try {
    await page.goto(url.toString(), { timeout: 60 * 1000, waitUntil: 'domcontentloaded' });

    console.log('Waiting for challenge');

    const selector = /\d+\/\d+(_\d+)?.html$/.test(pathname) ? '.mlfy_main' :  '.wrap'

    await page.waitForSelector(selector);

    console.log('Navigate OK', url.toString());

    // Screenshot for debugging
    await fs.mkdir('.screenshot').catch(() => {});

    await page.screenshot({
      path: path.join('./.screenshot', filename),
      fullPage: true
    });

    return await page.content();
  } catch (error) {
    console.error(error);

    await fs.mkdir('.screenshot').catch(() => {});

    await page.screenshot({
      path: path.join('./.screenshot', filename),
      fullPage: true
    });

    throw error;
  }
}

const nid = 1410;
const novel = await fetchNovelPage(fetchHTML, nid);

console.log(novel);

for (const vol of novel?.volumes ?? []) {
  const vid = vol.vid;
  const volume = await fetchNovelVolumePage(fetchHTML, nid, vid);

  console.log(volume);

  if (!volume) continue;

  await fs.mkdir(`.data/${volume.name}`, { recursive: true }).catch(() => {});

  for (const ch of volume.chapters) {
    const cid = ch.cid;

    const chapter = await fetchNovelChapterPages(fetchHTML, nid, cid, {
      delay: 5 * 1000,
      transformBbcode: true,
      transformImgSrc(_url) {
        try {
          if (_url.startsWith('/files/')) {
            _url = 'https://www.linovelib.com' + _url;
          }

          const url = new URL(_url);
          if (url.host === 'img3.readpai.com') {
            return `${url.pathname}${url.search}`;
          }
          if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
            return `${url.pathname}${url.search}`;
          }
          return _url;
        } catch (error) {
          return _url;
        }
      }
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

await browser.close();
