import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  ConnectOverCDPOptions
} from 'playwright';

import stealth from 'puppeteer-extra-plugin-stealth';
import { chromium, devices } from 'playwright-extra';

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
    context.close();
  }
}
