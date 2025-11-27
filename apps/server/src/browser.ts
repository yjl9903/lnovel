import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  ConnectOverCDPOptions
} from 'playwright';

import stealth from 'puppeteer-extra-plugin-stealth';
import { chromium, devices } from 'playwright-extra';
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

export async function runBrowserContext<T>(
  browserPromise: Browser | Promise<Browser>,
  fn: (context: BrowserContext) => Promise<T>,
  options?: BrowserContextOptions | undefined
) {
  const browser = await browserPromise;

  const context = await browser.newContext({
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    ...devices['iPhone 13 Pro Max'],
    ...options
  });

  try {
    return await fn(context);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runBrowserContextWithCache<T extends {}>(
  browserPromise: Browser | Promise<Browser>,
  cache: LRUCache<string, Awaited<T>>,
  key: string,
  fn: (context: BrowserContext) => Promise<Awaited<T> | null | undefined>,
  options?: BrowserContextOptions | undefined
) {
  const result = cache.get(key);
  if (result !== undefined && result !== null) return result;

  const browser = await browserPromise;

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
    return result;
  } finally {
    context.close();
  }
}
