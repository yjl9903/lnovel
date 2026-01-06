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
import { createConsola } from 'consola';

import { CloudflareError } from 'bilinovel';

import { type RetryOptions, sleep } from './utils';

const limit = pLimit(1);

const consola = createConsola().withTag('browser');

chromium.use(stealth());

export async function launchBrowser(options?: LaunchOptions | undefined) {
  if (process.env.CHROMIUM_USER_DIR) {
    const ctx = await chromium.launchPersistentContext(process.env.CHROMIUM_USER_DIR, options);
    const browser = ctx.browser();
    if (browser) {
      return browser;
    } else {
      await ctx.close().catch(() => {});
    }
  }
  return await chromium.launch(options);
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
        ...devices['Desktop Chrome HiDPI'],
        ...options,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
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
  options: {
    context?: BrowserContextOptions | undefined;
    maxRetry?: number;
  } = {}
) {
  const result = await cache.get(key);
  if (result !== undefined && result !== null) return result;

  const browser = await browserPromise;

  return new Promise<Awaited<T> | null | undefined>(async (res, rej) => {
    await limit(async () => {
      let context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        ...devices['Desktop Chrome HiDPI'],
        ...options.context,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
      });

      const MAX_RETRY = options.maxRetry
        ? options.maxRetry < 0
          ? Number.MAX_SAFE_INTEGER
          : options.maxRetry
        : 1;

      let error: unknown;
      let delay = 500;
      let hacked = false;

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

          const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL;
          if (
            error instanceof CloudflareError &&
            FLARESOLVERR_URL &&
            (!hacked || turn + 1 < MAX_RETRY)
          ) {
            try {
              consola.log('Proxy to flaresolverr', error.url.toString());

              if (!hacked) {
                hacked = true;
                turn -= 1;
              }

              const resp = await fetch(FLARESOLVERR_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  cmd: 'request.get',
                  url: error.url.toString(),
                  maxTimeout: 30 * 1000
                })
              });
              if (resp.ok) {
                const data: any = await resp.json();
                const { status, solution } = data;
                if (status === 'ok' && solution) {
                  consola.log('Receive from flaresolverr', {
                    url: solution.url,
                    status: solution.status,
                    cookies: solution.cookies.map((c: any) => c.name),
                    userAgent: solution.userAgent
                  });

                  await context.close().catch(() => {});

                  context = await browser.newContext({
                    locale: 'zh-CN',
                    timezoneId: 'Asia/Shanghai',
                    ...devices['Desktop Chrome HiDPI'],
                    ...options.context,
                    userAgent: solution.userAgent
                  });

                  await context.addCookies(
                    solution.cookies.map((cookie: any) => ({
                      name: cookie.name,
                      value: cookie.value,
                      domain: cookie.domain,
                      path: cookie.path,
                      expires: cookie.expiry,
                      httpOnly: cookie.httpOnly,
                      secure: cookie.secure,
                      sameSite: cookie.sameSite
                    }))
                  );
                }
              } else {
                consola.error('Receive from flaresolverr', resp);
              }
            } catch (error) {
              consola.error('Receive from flaresolverr', error);
            }
          }

          if (turn + 1 < MAX_RETRY) {
            consola.error(`Retry ${turn + 1} / ${MAX_RETRY}, due to:`, error);

            await sleep(delay);
            delay = Math.min(delay * 2, 30 * 1000);
          }
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
