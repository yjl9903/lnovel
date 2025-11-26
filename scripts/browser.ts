import fs from 'node:fs/promises';
import path from 'node:path';

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

// const broswer = connectBrowserOverCDP(
//   'ws://127.0.0.1:9222/devtools/browser/2daf55e4-ffe4-4c36-b71f-c8f7c0f5784a'
// );
const browser = launchBrowser();

runBrowserContext<void>(browser, async (ctx) => {
  console.log('chrome has been connected...');

  const novel = await fetchNovelPage(ctx, nid);
  console.log(novel);

  await fs.mkdir('./.data/').catch(() => {});

  for (const volume of novel?.volumes ?? []) {
    const info = await fetchNovelVolumePage(ctx, nid, volume.vid);
    if (!info) continue;

    console.log(info);

    await fs.mkdir(`./.data/${info.name}/`).catch(() => {});

    for (const chapter of info?.chapters ?? []) {
      const content = await fetchNovelChapters(ctx, nid, chapter.cid);
      if (content) {
        console.log(content.title);
        await fs.writeFile(`./.data/${info.name}/${content.title}.html`, content.content, 'utf-8');
      }
    }

    break;
  }
});
