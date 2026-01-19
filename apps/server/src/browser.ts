import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  ConnectOverCDPOptions,
  Page
} from 'playwright';

import stealth from 'puppeteer-extra-plugin-stealth';
import { chromium, devices } from 'playwright-extra';
import pLimit, { type LimitFunction } from 'p-limit';
import { Hono } from 'hono';
import { LRUCache } from 'lru-cache';
import { createConsola } from 'consola';

import { CloudflareError } from 'bilinovel';

import type { AppEnv } from './app';

import { sleep } from './utils';
import { TaskManager, Task } from './task';

const consola = createConsola().withTag('browser');

chromium.use(stealth());

export const browserTaskManager = new TaskManager();

export type BrowserTask = Task<{}>;

export const app = new Hono<AppEnv>();

app.get('/tasks', async (c) => {
  return c.json({
    ok: true,
    tasks: (await browserTaskManager.getRunningTasks()).map((t) => t.toJSON())
  });
});

app.post('/task/abort', async (c) => {
  const key = new URL(c.req.url).searchParams.get('key');

  const aborted = key ? await browserTaskManager.abort(key) : false;

  return c.json({
    ok: aborted,
    key
  });
});

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

export async function runBrowserContext<T extends {}>(
  browserPromise: Browser | Promise<Browser>,
  key: string,
  fn: (context: BrowserContext, task: BrowserTask) => Promise<Awaited<T> | null | undefined>,
  options: {
    interval?: number;
    cache?: LRUCache<string, Awaited<T>>;
    limit?: LimitFunction;
    context?: BrowserContextOptions | undefined;
    maxRetry?: number;
  } = {}
) {
  const result = await options.cache?.get(key);
  if (result !== undefined && result !== null) return result;

  const browser = await browserPromise;

  return new Promise<Awaited<T> | null | undefined>(async (res, rej) => {
    const task = await browserTaskManager.register(key, {});

    const limit = options.limit ?? pLimit(1); // 故意直接执行, 无并发控制

    await limit(async () => {
      if (task.aborted) {
        rej(new Error(`Task "${key}" is aborted`));
        return;
      }

      if (limit.pendingCount > 0) {
        const interval = options.interval || 1000;
        await sleep(interval + Math.random() * interval);
      }

      await task.start();

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

      const MAX_HACK = 3;

      let error: unknown;
      let delay = 5000;
      let hacked = 0;


      for (let turn = 0; turn < MAX_RETRY; turn++) {
        try {
          if (task.aborted) break;

          const result = await fn(context, task);
          if (result !== undefined && result !== null) {
            options.cache?.set(key, result);
          }

          await task.finish();
          await context.close().catch(() => {});

          res(result);

          return;
        } catch (_error) {
          error = _error;

          if (task.aborted) break;

          const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL;
          if (
            error instanceof CloudflareError &&
            FLARESOLVERR_URL &&
            (hacked < MAX_HACK || turn + 1 < MAX_RETRY)
          ) {
            try {
              consola.log('Proxy to flaresolverr', error.url.toString());

              if (hacked < MAX_HACK) {
                hacked++;
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
          } else if (error instanceof CloudflareError) {
            break;
          }

          if (turn + 1 < MAX_RETRY) {
            consola.error(`Retry ${turn + 1} / ${MAX_RETRY}, due to:`, error);

            await sleep(delay);
            delay = Math.min(delay * 2, 60 * 1000);
          }
        }
      }

      await task.finish();
      await context.close().catch(() => {});

      rej(
        error
          ? error
          : task.aborted
            ? new Error(`Task "${key}" is aborted`)
            : new Error('failed after retry')
      );
    });
  });
}

export async function dumpPageScreenshot(filename: string, page: Page) {
  try {
    await fs.mkdir(path.dirname(filename), { recursive: true }).catch(() => {});
    const buffer = await page.screenshot();
    await fs.writeFile(filename, buffer);
  } catch {}
}

export async function waitLimitIdle(
  limit: LimitFunction,
  {
    threshold = 0,
    timeout = 1000
  }: {
    threshold?: number;
    timeout?: number;
  } = {}
) {
  return new Promise<void>((res) => {
    const waiting = () => {
      if (limit.pendingCount <= threshold) {
        res();
      } else {
        setTimeout(waiting, timeout);
      }
    };
    setTimeout(waiting, timeout);
  });
}
