import {
  launchBrowser,
  connectBrowserOverCDP,
  runBrowserContext
} from '../apps/server/src/browser';

import { fetchNovelPage, fetchNovelVolumePage } from '../packages/bilinovel/src/index';

// const broswer = connectBrowserOverCDP(
//   'ws://127.0.0.1:9222/devtools/browser/2daf55e4-ffe4-4c36-b71f-c8f7c0f5784a'
// );
const browser = launchBrowser();

runBrowserContext<void>(browser, async (ctx) => {
  console.log('chrome has been connected...');
  const nid = 4649;
  const novel = await fetchNovelPage(ctx, nid);
  console.log(novel);
  for (const volume of novel?.volumes ?? []) {
    const info = await fetchNovelVolumePage(ctx, nid, volume.vid);
    console.log(info);
  }
});
