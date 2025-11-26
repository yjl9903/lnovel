import {
  launchBrowser,
  connectBrowserOverCDP,
  runBrowserContext
} from '../apps/server/src/browser';

import { fetchNovelPage } from '../packages/bilinovel/src/index';

// const broswer = connectBrowserOverCDP(
//   'ws://127.0.0.1:9222/devtools/browser/2daf55e4-ffe4-4c36-b71f-c8f7c0f5784a'
// );
const browser = launchBrowser();

runBrowserContext<void>(browser, async (ctx) => {
  console.log('chrome has been connected...');
  const resp = await fetchNovelPage(ctx, 4649);
  console.log(resp);
});
