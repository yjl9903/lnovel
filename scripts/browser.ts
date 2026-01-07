import fs from 'node:fs/promises';
import path from 'node:path';

import 'dotenv/config';

import {
  launchBrowser,
  // connectBrowserOverCDP,
  runBrowserContext
} from '../apps/server/src/browser';

import {
  fetchNovelPage,
  fetchNovelVolumePage,
  fetchNovelChapters
} from '../packages/bilinovel/src/index';

const nid = 4649;

// const browser = connectBrowserOverCDP(
//   'ws://127.0.0.1:9222/devtools/browser/a5c1c9d3-9ea9-49f6-ae94-6dd01840c1b1'
// );
const browser = launchBrowser();

await fs.mkdir('./.data/').catch(() => {});

await runBrowserContext(browser, 'novel', async (ctx) => {
  console.log('chrome has been connected...');

  const novel = await fetchNovelPage(ctx, nid);
  console.log(novel);

  const volumes = (
    await Promise.all(
      (novel?.volumes ?? []).map(async (volume) => await fetchNovelVolumePage(ctx, nid, volume.vid))
    )
  ).filter(Boolean);

  for (const info of volumes) {
    if (!info) continue;

    console.log(info);

    await fs.mkdir(`./.data/${info.name}/`).catch(() => {});

    for (const chapter of info?.chapters ?? []) {
      console.log(chapter);
      const content = await fetchNovelChapters(ctx, nid, chapter.cid, {
        delay: 5000,
        transformBbcode: true
      });
      if (content) {
        content.content = content.content.replaceAll('https://img3.readpai.com/4/4649/274117/', '');

        content.content = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh" xml:lang="zh"><head>
  <title>${content.title}</title>
</head>
<body>
<h2>${content.title}</h2>
${content.content}
</body></html>`;

        await fs.writeFile(`./.data/${info.name}/${content.title}.html`, content.content, 'utf-8');
      }
    }
  }
});

console.log('chrome is been closing...');

await (await browser).close();
