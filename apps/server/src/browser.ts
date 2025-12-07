import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  ConnectOverCDPOptions
} from 'playwright';

import stealth from 'puppeteer-extra-plugin-stealth';
import { chromium, devices } from 'playwright-extra';
import pLimit from 'p-limit';
import { LRUCache } from 'lru-cache';

chromium.use(stealth());

export function launchBrowser(options?: LaunchOptions | undefined) {
  return chromium.launch(options);
}

export function connectBrowserOverCDP(
  wsEndpointOrOptions:
    | string
    | (ConnectOverCDPOptions & {
        endpointURL?: string;
      }),
  wsOptions?: ConnectOverCDPOptions
) {
  return chromium.connectOverCDP(wsEndpointOrOptions, wsOptions);
}

const limit = pLimit(1);

export async function runBrowserContext<T>(
  browserPromise: Browser | Promise<Browser>,
  fn: (context: BrowserContext) => Promise<T>,
  options?: BrowserContextOptions | undefined
) {
  const browser = await browserPromise;

  return new Promise<T>(async (res, rej) => {
    await limit(async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        ...devices['iPhone 13 Pro Max'],
        ...options
      });

      try {
        const result = await fn(context);
        res(result);
      } catch (error) {
        rej(error);
      } finally {
        await context.close().catch(() => {});
      }
    });
  });
}

export async function runBrowserContextWithCache<T extends {}>(
  browserPromise: Browser | Promise<Browser>,
  cache: LRUCache<string, Awaited<T>>,
  key: string,
  fn: (context: BrowserContext) => Promise<Awaited<T> | null | undefined>,
  options?: BrowserContextOptions | undefined
) {
  const result = await cache.get(key);
  if (result !== undefined && result !== null) return result;

  const browser = await browserPromise;

  return new Promise<Awaited<T> | null | undefined>(async (res, rej) => {
    await limit(async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        ...devices['iPhone 13 Pro Max'],
        ...options
      });

      try {
        const result = await fn(context);
        if (result !== undefined && result !== null) {
          cache.set(key, result);
        }
        res(result);
      } catch (error) {
        rej(error);
      } finally {
        await context.close().catch(() => {});
      }
    });
  });
}
