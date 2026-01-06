import { Page } from 'playwright';
// import fs from 'fs';

import { sleep } from './utils';

// --- 定义需要屏蔽的关键词列表 ---
export const BLOCK_LIST = [
  'google-analytics.com',
  'googletagmanager.com',
  '/gtm.js',
  '/analytics.js',
  'doubleclick.net',
  'googleadservices.com',
  'facebook.net', // Facebook Pixel
  'adnxs.com', // 常见广告商
  'criteo.com'
];

export async function blockRoutes(page: Page, list = BLOCK_LIST) {
  await page.route('**/*', (route) => {
    const url = route.request().url();

    // 检查 URL 是否包含黑名单中的关键词
    const shouldBlock = list.some((keyword) => url.includes(keyword));

    if (shouldBlock) {
      route.abort(); // 直接中断请求
    } else {
      route.continue(); // 放行其他请求
    }
  });
  return page;
}

export async function isCloudflarePage(page: Page) {
  if ((await page.locator('#cf-wrapper').count()) > 0) return true;

  if ((await page.locator('.ray-id').count()) > 0) {
    // console.log('开始质询');

    // 等待页面稍微稳定
    await page.waitForTimeout(3000);

    // console.log('等待结束');

    let retries = 0;
    while (retries < 5 && (await page.locator('.ray-id').count()) > 0) {
      retries++;

      // fs.writeFileSync('test1.png', await page.screenshot());

      // console.log('开始点击');

      const box = await page.locator('.main-content > div:first-of-type').boundingBox();

      if (box) {
        const offsetX = box.x + 75;
        const offsetY = box.y + box.height / 2;
        await page.mouse.click(offsetX, offsetY);

        // console.log('点击 mouse', offsetX, offsetY);

        // fs.writeFileSync('test2.png', await page.screenshot());

        // console.log('再次等待');

        // 等待页面稍微稳定
        await page.waitForLoadState('networkidle').catch(() => {});
        await sleep(1000 + 1000 * Math.random());

        // fs.writeFileSync('test3.png', await page.screenshot());

        // console.log('等待结束');
      }
    }

    return true;
  }

  return false;
}
