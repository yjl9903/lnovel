import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  ConnectOverCDPOptions
} from 'playwright';

import { createConsola } from 'consola';

import stealth from 'puppeteer-extra-plugin-stealth';
import { chromium, devices } from 'playwright-extra';
import pLimit from 'p-limit';
import { LRUCache } from 'lru-cache';

const limit = pLimit(1);

const consola = createConsola().withTag('browser');

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
        ...devices['iPad Pro 11'],
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

      const MAX_RETRY = 5;

      let error: unknown;
      let delay = 500;

      for (let turn = 0; turn < MAX_RETRY; turn++) {
        try {
          const result = await fn(context);
          if (result !== undefined && result !== null) {
            cache.set(key, result);
          }
          await context.close().catch(() => {});
          res(result);
          return;
        } catch (_error) {
          error = _error;
          if (error instanceof Error && error.message.includes('Request timeout')) {
            consola.error(`Retry ${key} ${turn + 1} / ${MAX_RETRY}`);
            consola.error(error);
            delay = Math.min(delay * 2, 30 * 1000);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          break;
        }
      }

      await context.close().catch(() => {});
      rej(error ? error : new Error('failed after retry'));
    });
  });
}

export async function waitBrowserIdle(threshold: number = 0) {
  return new Promise<void>((res) => {
    const waiting = () => {
      if (limit.pendingCount <= threshold) {
        res();
      } else {
        setTimeout(waiting, 1000);
      }
    };
    waiting();
  });
}
