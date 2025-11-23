import puppeteer, { type Page, type Browser } from '@cloudflare/puppeteer';

import type { Context } from './env';

export async function launchBrowser<T>(
  c: Context,
  fn: (page: Page, browser: Browser) => Promise<T>
) {
  const browser = await puppeteer.launch(c.env.BROWSER);

  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    Accept: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6'
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0'
  );
  await page.setViewport({
    width: 2160,
    height: 1080,
    deviceScaleFactor: 2
  });

  try {
    const result = await fn(page, browser);
    return result;
  } catch (error) {
    console.error('[browser]', error);
    throw error;
  } finally {
    await browser.close();
  }
}
