import fs from 'node:fs/promises';
import path from 'node:path';

import { LRUCache } from 'lru-cache';
import { createConsola } from 'consola';
import { launchPersistentContext } from 'cloakbrowser';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

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

const LOCAL_BROWSER_TTL = 12 * 60 * 60 * 1000;
const LOCAL_LAUNCH_RETRY_DELAY = 60 * 1000;
const DEFAULT_REQUEST_INTERVAL = 15 * 1000;
const PAGE_CREATE_TIMEOUT = 10 * 1000;
const PAGE_NAVIGATION_TIMEOUT = 2 * 60 * 1000;
const GOTO_TIMEOUT = 60 * 1000;
const PAGE_CLOSE_TIMEOUT = 2 * 1000;
const DEFAULT_RATE_LIMIT_DELAY = 5 * 60 * 1000;
const SCRAPELESS_INSUFFICIENT_BALANCE_COOLDOWN = 60 * 60 * 1000;
const LOCAL_BROWSER_VIEWPORT = { width: 1920, height: 947 };
const LOCAL_BROWSER_TIMEZONE = 'Asia/Shanghai';
const LOCAL_BROWSER_LOCALE = 'zh-CN';

const BLOCKED_TYPES = new Set(['image', 'media', 'stylesheet', 'font']);
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

type BrowserKind = 'local' | 'remote';

interface LocalBrowser {
  context: BrowserContext;
  closed: boolean;
  startedAt: number;
}

class RateLimitError extends Error {
  public constructor(url: URL) {
    super(`${url.toString()} is rate limited by cloudflare`);
  }
}

class ScrapelessUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

let localBrowser: Promise<LocalBrowser> | undefined;
let localBrowserLock: Promise<void> = Promise.resolve();
let localRetryAfter = 0;
let navigationLock: Promise<void> = Promise.resolve();
let nextNavigationAt = 0;
let scrapelessRetryAfter = 0;

const withTimeout = async <T>(
  task: Promise<T>,
  timeout: number,
  onTimeout: () => T
): Promise<T> => {
  return await Promise.race([task, sleep(timeout).then(onTimeout)]);
};

const withLocalBrowserLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const previous = localBrowserLock;
  let release: () => void = () => {};
  localBrowserLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});

  try {
    return await fn();
  } finally {
    release();
  }
};

const launchLocalBrowser = async (): Promise<LocalBrowser> => {
  const userDataDir = process.env.CHROMIUM_USER_DIR || path.resolve('.profile');

  consola.log('Connecting to local CloakBrowser', userDataDir);

  const context = await launchPersistentContext({
    userDataDir,
    headless: process.env.CLOAKBROWSER_HEADLESS === 'false' ? false : true,
    viewport: LOCAL_BROWSER_VIEWPORT,
    timezone: LOCAL_BROWSER_TIMEZONE,
    locale: LOCAL_BROWSER_LOCALE,
    humanize: true,
    humanPreset: 'careful',
    humanConfig: {
      idle_between_actions: true,
      idle_between_duration: [0.4, 1.0],
      scroll_pause_fast: [100, 200],
      scroll_pause_slow: [250, 600]
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const browser = { context, closed: false, startedAt: Date.now() };
  context.on('close', () => {
    browser.closed = true;
  });

  consola.log('Connected to local CloakBrowser');

  return browser;
};

const getLocalBrowser = async (): Promise<LocalBrowser> => {
  return await withLocalBrowserLock(async () => {
    const now = Date.now();
    if (now < localRetryAfter) {
      throw new Error(
        `Local browser launch is cooling down until ${new Date(localRetryAfter).toISOString()}`
      );
    }

    if (localBrowser) {
      try {
        const browser = await localBrowser;
        const expired = now - browser.startedAt > LOCAL_BROWSER_TTL;

        if (!browser.closed && !expired) {
          return browser;
        }

        consola.log('Restarting local browser');
        await browser.context.close().catch(() => {});
      } catch (error) {
        consola.error('Local browser is unavailable', error);
      }

      localBrowser = undefined;
    }

    const pending = launchLocalBrowser().catch((error) => {
      if (localBrowser === pending) {
        localBrowser = undefined;
        localRetryAfter = Date.now() + LOCAL_LAUNCH_RETRY_DELAY;
      }
      throw error;
    });

    localBrowser = pending;
    return await pending;
  });
};

const connectScrapeless = async (options: ScrapelessOptions): Promise<Browser> => {
  const now = Date.now();
  if (now < scrapelessRetryAfter) {
    throw new ScrapelessUnavailableError(
      `Scrapeless remote browser is disabled until ${new Date(scrapelessRetryAfter).toISOString()}`
    );
  }

  const token = options.token || process.env.SCRAPELESS_TOKEN;
  if (!token) {
    throw new Error('SCRAPELESS_TOKEN is required to connect to remote browser');
  }

  const query = new URLSearchParams({
    token,
    // proxyCountry: 'ANY',
    proxyCountry: 'US',
    proxyState: 'CA',
    proxyCity: 'los_angeles',
    sessionTTL: String(options.sessionTTL ?? 60 * 3)
  });

  consola.log('Connecting to remote browser');

  try {
    const browser = await chromium.connectOverCDP(
      `wss://browser.scrapeless.com/api/v2/browser?${query.toString()}`
    );
    consola.log('Connected to remote browser', browser.isConnected());
    return browser;
  } catch (error) {
    if (isScrapelessInsufficientBalanceError(error)) {
      scrapelessRetryAfter = Date.now() + SCRAPELESS_INSUFFICIENT_BALANCE_COOLDOWN;
      throw new ScrapelessUnavailableError(
        `Scrapeless has insufficient balance, disabled remote browser until ${new Date(
          scrapelessRetryAfter
        ).toISOString()}`
      );
    }

    throw error instanceof Error
      ? error
      : new Error('Remote browser connection failed', { cause: error });
  }
};

const isScrapelessInsufficientBalanceError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /insufficient balance/i.test(message) || /"code"\s*:\s*14500/.test(message);
};

const waitForNavigationSlot = async (interval: number) => {
  const previous = navigationLock;
  let release: () => void = () => {};
  navigationLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});

  try {
    const wait = Math.max(0, nextNavigationAt - Date.now());
    if (wait > 0) {
      consola.log(`Waiting ${Math.round(wait / 1000)}s before next navigation`);
      await sleep(wait);
    }

    nextNavigationAt = Date.now() + interval + Math.random() * interval;
  } finally {
    release();
  }
};

const waitForRateLimit = async (delay: number) => {
  const wait = delay + Math.random() * delay;
  nextNavigationAt = Math.max(nextNavigationAt, Date.now() + wait);

  consola.log(`Rate limited, waiting ${Math.round(wait / 1000)}s before retry`);
  await sleep(wait);
};

const interceptPage = async (page: Page) => {
  await page
    .route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const blocked =
        BLOCKED_TYPES.has(request.resourceType()) ||
        BLOCKED_DOMAINS.some((domain) => url.includes(domain)) ||
        BLOCKED_PATHS.some((pattern) => url.includes(pattern));

      if (blocked) {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    })
    .catch(() => {});
};

const isRateLimitedContent = (content: string) => {
  return (
    /error\s*1015/i.test(content) ||
    /you are being rate limited/i.test(content) ||
    /banned you temporarily/i.test(content)
  );
};

const assertPageReady = async (
  page: Page,
  url: URL,
  selector: string | undefined,
  local: boolean
) => {
  const count = async (selector: string) => await page.locator(selector).count();

  if (local && ((await count('#cf-wrapper')) > 0 || (await count('.ray-id')) > 0)) {
    throw new Error(`${url.toString()} is blocked by cloudflare`);
  }

  if (!selector) return;

  if (local) {
    if ((await count(selector)) === 0) {
      throw new Error(`${url.toString()} is blocked by cloudflare`);
    }
    return;
  }

  await page.waitForSelector(selector, { timeout: GOTO_TIMEOUT });
};

const screenshotFilename = (pathname: string) => {
  return pathname
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/\.html$/, '.png')
    .replace('catalog', 'catalog.png');
};

const saveScreenshot = async (page: Page | undefined, filename: string) => {
  if (!page) return;

  await fs.mkdir('.screenshot').catch(() => {});
  await page
    .screenshot({ path: path.join('.screenshot', filename), fullPage: true })
    .catch(() => {});
};

const closePage = async (page: Page | undefined) => {
  if (!page || page.isClosed()) return;
  await Promise.race([page.close().catch(() => {}), sleep(PAGE_CLOSE_TIMEOUT)]);
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

    /**
     * 遇到 Cloudflare 1015 限流后的等待间隔
     */
    rateLimited?: number;
  };
}

export interface Session {
  fetch: BilinovelFetch;
  newPage: () => Promise<Page | undefined>;
  close: () => Promise<void>;
}

export function createBilinovelSession(options: SessionOptions = {}): Session {
  const MAX_RETRY = options.retry?.max ?? 3;
  const delayInterval = options.delay?.interval ?? DEFAULT_REQUEST_INTERVAL;
  const delayReconnect = options.delay?.reconnect ?? 10 * 1000;
  const delayRateLimited = options.delay?.rateLimited ?? DEFAULT_RATE_LIMIT_DELAY;

  let remoteBrowser: Browser | undefined;
  let remoteBrowserPromise: Promise<Browser> | undefined;
  let forceRemote = false;

  const closeRemoteBrowser = async (browser: Browser | undefined) => {
    if (!browser) return;

    consola.log('Closing remote browser');
    await withTimeout(browser.close(), PAGE_CLOSE_TIMEOUT, () => {
      consola.log('Closing browser timeout');
    }).catch(() => {});
  };

  const close = async () => {
    const browser = remoteBrowser;
    const pending = remoteBrowserPromise;
    remoteBrowser = undefined;
    remoteBrowserPromise = undefined;

    if (browser) {
      await closeRemoteBrowser(browser);
      return;
    }

    const pendingBrowser = await pending?.catch(() => undefined);
    await closeRemoteBrowser(pendingBrowser);
  };

  const getRemoteBrowser = async (): Promise<Browser> => {
    if (remoteBrowser?.isConnected()) {
      return remoteBrowser;
    }

    if (remoteBrowserPromise) {
      const browser = await remoteBrowserPromise;
      if (remoteBrowser === browser && browser.isConnected()) {
        return browser;
      }

      await closeRemoteBrowser(browser);
      if (remoteBrowser !== browser) {
        throw new Error('Remote browser connection was closed before use');
      }

      remoteBrowser = undefined;
      remoteBrowserPromise = undefined;
    }

    await closeRemoteBrowser(remoteBrowser);
    remoteBrowser = undefined;
    remoteBrowserPromise = undefined;

    const pending = connectScrapeless(options.scrapeless ?? {})
      .then((browser) => {
        if (remoteBrowserPromise === pending) {
          remoteBrowser = browser;
        }

        return browser;
      })
      .catch((error) => {
        if (remoteBrowserPromise === pending) {
          remoteBrowserPromise = undefined;
        }

        throw error;
      });

    remoteBrowserPromise = pending;

    const browser = await pending;
    const connected = browser.isConnected();
    if (remoteBrowser !== browser || !connected) {
      await closeRemoteBrowser(browser);
      throw new Error('Remote browser connection was closed before use');
    }

    return browser;
  };

  const createRemotePage = async () => {
    const browser = await getRemoteBrowser();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await interceptPage(page);
    return { kind: 'remote' as const, page };
  };

  const createLocalPage = async () => {
    const browser = await getLocalBrowser();
    const page = await browser.context.newPage();
    await interceptPage(page);
    return { kind: 'local' as const, page };
  };

  const createPage = async (): Promise<{ kind: BrowserKind; page: Page }> => {
    if (!forceRemote) {
      try {
        consola.log('Creating new local page');
        return await createLocalPage();
      } catch (error) {
        consola.error('Failed creating local page, fallback to remote browser', error);
        forceRemote = true;
      }
    }

    consola.log('Creating new remote page');
    return await createRemotePage();
  };

  const newPageWithKind = async () => {
    return await withTimeout(createPage(), PAGE_CREATE_TIMEOUT, () => {
      consola.error('Creating new page timeout');
      return undefined;
    });
  };

  const newPage = async () => (await newPageWithKind())?.page;

  const fetchWithPage = async (
    page: Page,
    kind: BrowserKind,
    url: URL,
    selector: string | undefined
  ) => {
    consola.log(`Start ${kind} navigating to ${url.toString()}`);

    await page.goto(url.toString(), {
      timeout: GOTO_TIMEOUT,
      waitUntil: 'domcontentloaded'
    });

    let content = await page.content();
    if (isRateLimitedContent(content)) {
      throw new RateLimitError(url);
    }

    await assertPageReady(page, url, selector, kind === 'local');

    content = await page.content();
    if (isRateLimitedContent(content)) {
      throw new RateLimitError(url);
    }

    ERRORS.delete(url.toString());
    consola.log(`Finish ${kind} navigating to ${url.toString()}`);

    return content;
  };

  return {
    fetch: async (pathname, { selector } = {}) => {
      const url = new URL(pathname, BASE_URL);
      const lastError = ERRORS.get(url.toString());
      if (lastError && lastError.count > MAX_ERROR) {
        consola.log(`Skip navigating to ${url.toString()} (repeated ${lastError.count} times)`);
        throw lastError.error;
      }

      const filename = screenshotFilename(pathname);
      let current = await newPageWithKind();

      for (let turn = 0; turn <= MAX_RETRY; turn++) {
        try {
          if (!current || current.page.isClosed()) {
            current = await newPageWithKind();
          }
          if (!current) {
            throw new Error('Failed creating page');
          }

          await waitForNavigationSlot(delayInterval);

          const content = await withTimeout(
            fetchWithPage(current.page, current.kind, url, selector),
            PAGE_NAVIGATION_TIMEOUT,
            () => {
              consola.error(`Navigating to ${url.toString()} timeout`);
              return undefined;
            }
          );

          await closePage(current.page);

          if (content) {
            return content;
          }

          throw new Error(`Fetch timeout: "${url.toString()}"`);
        } catch (error) {
          consola.error(`Failed fetching "${url.toString()}"`, error);

          forceRemote = true;

          const lastError = ERRORS.get(url.toString());
          ERRORS.set(url.toString(), { count: (lastError?.count || 0) + 1, error });

          await saveScreenshot(current?.page, filename);
          await closePage(current?.page);
          await close();

          if (turn === MAX_RETRY || error instanceof ScrapelessUnavailableError) {
            throw error;
          }

          consola.log(`Retry fetching "${url.toString()}"`, `${turn}/${MAX_RETRY}`);

          if (error instanceof RateLimitError) {
            await waitForRateLimit(delayRateLimited);
          } else {
            await sleep(delayReconnect + Math.random() * delayReconnect);
          }

          current = await newPageWithKind();
        }
      }

      throw new Error('unreachable');
    },
    newPage,
    close
  };
}
