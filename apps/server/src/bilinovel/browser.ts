import fs from 'node:fs/promises';
import path from 'node:path';

import { LRUCache } from 'lru-cache';
import { createConsola } from 'consola';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import type { BilinovelFetch } from 'bilinovel';

import { sleep } from '../utils';

interface ScrapelessOptions {
  /**
   * API Token
   */
  token?: string;

  /**
   * 单位: 秒
   */
  sessionTTL?: number;
}

const BASE_URL = 'https://www.linovelib.com';

const consola = createConsola().withTag('browser');

// 防止请求雪崩, 缓存一定时间失败的链接
const ERRORS = new LRUCache<string, { count: number; error: unknown }>({
  max: 100,
  ttl: 60 * 60 * 1000
});

const MAX_ERROR = 10;

const launchLocalBrowser = async (): Promise<Browser> => {
  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (!executablePath) {
    try {
      executablePath = puppeteer.executablePath();
    } catch {}
  }

  return puppeteer.launch({
    executablePath,
    defaultViewport: null,
    userDataDir: process.env.CHROMIUM_USER_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
};

const localBrowser = launchLocalBrowser();

const connectScrapeless = async (options: ScrapelessOptions) => {
  const query = new URLSearchParams({
    token: options.token || process.env.SCRAPELESS_TOKEN!,
    // proxyCountry: 'ANY',
    proxyCountry: 'US',
    proxyState: 'CA',
    proxyCity: 'los_angeles',
    sessionTTL: String(options.sessionTTL ?? 60 * 3)
  });

  const connectionURL = `wss://browser.scrapeless.com/api/v2/browser?${query.toString()}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: connectionURL,
    defaultViewport: null
  });

  consola.log('Connected to remote browser', browser.connected);

  return browser;
};

export interface SessionOptions {
  scrapeless?: ScrapelessOptions;

  retry?: {
    max?: number;
  };

  delay?: {
    /**
     * 请求之间的间隔
     */
    interval?: number;

    /**
     * 重连浏览器之间的间隔
     */
    reconnect?: number;
  };
}

export interface Session {
  fetch: BilinovelFetch;
  newPage: () => Promise<Page | undefined>;
  close: () => Promise<void>;
}

export function createBilinovelSession(options: SessionOptions = {}): Session {
  const { scrapeless } = options;

  const MAX_RETRY = options?.retry?.max ?? 3;

  let first = true;
  let browser: Promise<Browser> | undefined = undefined;
  let forceRemote = false;
  const delayInterval = options.delay?.interval ?? 5 * 1000;
  const delayReconnect = options.delay?.reconnect ?? 10 * 1000;

  const isLocal = async () => {
    if (!browser) return false;
    try {
      return (await browser) === (await localBrowser);
    } catch {
      return false;
    }
  };

  const connect = async (): Promise<Browser> => {
    if (browser) await close();

    if (!forceRemote) {
      try {
        browser = Promise.resolve(localBrowser);
        return localBrowser;
      } catch (error) {
        consola.error('Local puppeteer launch failed, fallback to remote browser', error);
      }
    }

    return (browser = connectScrapeless(scrapeless ?? {}));
  };

  const close = async () => {
    if (!browser) return;
    try {
      await Promise.race([
        (async () => {
          if (!(await isLocal())) {
            await (await browser).close();
          }
        })(),
        sleep(2 * 1000)
      ]);
    } catch {
      // ignore error
    } finally {
      browser = undefined;
    }
  };

  const newPage = async () => {
    return await Promise.race([
      (async () => {
        if (!browser) {
          browser = connect();
        } else if (!(await browser).connected) {
          browser = connect();
        }

        try {
          const page = await (await browser).newPage();
          await interceptor(page);
          first = true;
          return page;
        } catch {
          browser = connect();
          const page = await (await browser).newPage();
          await interceptor(page);
          first = true;
          return page;
        }
      })(),
      sleep(10 * 1000).then(() => undefined)
    ]);

    async function interceptor(page: Page) {
      try {
        // Enable request interception
        await page.setRequestInterception(true);

        // Define resource types to block
        const BLOCKED_TYPES = new Set(['image', 'media', 'stylesheet', 'font']);

        // Define domains and URL patterns to block
        const BLOCKED_DOMAINS = [
          'google-analytics.com',
          'googletagmanager.com',
          'doubleclick.net',
          'twitter.com',
          'linkedin.com',
          'adservice.google.com',
          'googleadservices.com',
          'facebook.net', // Facebook Pixel
          'adnxs.com', // 常见广告商
          'criteo.com'
        ];

        const BLOCKED_PATHS = ['/ads/', '/analytics/', '/pixel/', '/tracking/', '/stats/'];

        // Intercept requests
        page.on('request', (request) => {
          // Check mime type
          if (BLOCKED_TYPES.has(request.resourceType())) {
            request.abort();
            return;
          }

          const url = request.url();

          // Check domain
          if (BLOCKED_DOMAINS.some((domain) => url.includes(domain))) {
            request.abort();
            return;
          }

          // Check path
          if (BLOCKED_PATHS.some((path) => url.includes(path))) {
            request.abort();
            return;
          }

          request.continue();
        });
      } catch {}
    }
  };

  return {
    fetch: async (pathname, { selector } = {}) => {
      let page = await newPage();

      const url = new URL(pathname, BASE_URL);

      const lastError = ERRORS.get(url.toString());
      if (lastError && lastError.count > MAX_ERROR) {
        consola.log(`Skip navigating to ${url.toString()} (repeated ${lastError.count} times)`);
        throw lastError.error;
      }

      const filename = pathname
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/\.html$/, '.png')
        .replace('catalog', 'catalog.png');

      for (let turn = 0; turn <= MAX_RETRY; turn++) {
        try {
          if (!page || page.isClosed()) {
            page = await newPage();
          }

          if (first) {
            first = false;
          } else {
            await sleep(delayInterval + Math.random() * delayInterval);
          }

          const local = await isLocal();

          const content = await Promise.race([
            (async () => {
              if (!page) throw new Error(`Failed creating page`);

              consola.log(`Start ${local ? 'local' : 'remote'} navigating to ${url.toString()}`);

              await page.goto(url.toString(), {
                timeout: 60 * 1000,
                waitUntil: 'domcontentloaded'
              });

              if (local) {
                if (
                  (await page.$$('#cf-wrapper')).length > 0 ||
                  (await page.$$('.ray-id')).length > 0
                ) {
                  throw new Error(`${url.toString()} is blocked by cloudflare`);
                }
              }

              if (selector) {
                if (local) {
                  const target = await page.$(selector);
                  if (!target) {
                    throw new Error(`${url.toString()} is blocked by cloudflare`);
                  }
                } else {
                  await page.waitForSelector(selector, { timeout: 60 * 1000 });
                }
              }

              ERRORS.delete(url.toString());

              const content = await page.content();

              consola.log(`Finish ${local ? 'local' : 'remote'} navigating to ${url.toString()}`);

              return content;
            })(),
            sleep(2 * 60 * 1000).then(() => undefined)
          ]);

          if (local && page) {
            try {
              await page.close().catch(() => {});
            } catch {}
          }

          if (content) {
            return content;
          }

          throw new Error(`Fetch timeout: "${url.toString()}"`);
        } catch (error) {
          consola.error(`Failed fetching "${url.toString()}"`, error);

          // 使用远程浏览器
          forceRemote = true;

          const lastError = ERRORS.get(url.toString());
          ERRORS.set(url.toString(), { count: (lastError?.count || 0) + 1, error });

          await fs.mkdir('.screenshot').catch(() => {});

          await page
            ?.screenshot({
              path: path.join('.screenshot', filename),
              fullPage: true
            })
            .catch(() => {});

          await Promise.race([page?.close().catch(() => {}), sleep(2 * 1000)]);

          if (turn === MAX_RETRY) {
            throw error;
          }

          consola.log(`Retry fetching "${url.toString()}"`, `${turn}/${MAX_RETRY}`);

          // 重新连接浏览器
          await sleep(delayReconnect + Math.random() * delayReconnect);

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
