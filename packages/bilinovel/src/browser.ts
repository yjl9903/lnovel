import { Page } from 'playwright';

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
  return (await page.locator('#cf-wrapper').count()) > 0;
}
