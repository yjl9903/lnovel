import fs from 'node:fs/promises';
import path from 'node:path';

import { createConsola } from 'consola';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

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

const connectScrapeless = async (options: ScrapelessOptions) => {
  const query = new URLSearchParams({
    token: options.token || process.env.SCRAPELESS_TOKEN!,
    proxyCountry: 'US',
    proxyState: 'CA',
    proxyCity: 'los_angeles',
    sessionTTL: String(options.sessionTTL ?? 60 * 5)
  });

  const connectionURL = `wss://browser.scrapeless.com/api/v2/browser?${query.toString()}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: connectionURL,
    defaultViewport: null
  });

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
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
}

export function createBilinovelSession(options: SessionOptions = {}): Session {
  const { scrapeless } = options;

  const MAX_RETRY = options?.retry?.max ?? 3;

  let first = true;
  let browser: Promise<Browser> | undefined = undefined;

  const delayInterval = options.delay?.interval ?? 5 * 1000;
  const delayReconnect = options.delay?.reconnect ?? 10 * 1000;

  const connect = async (): Promise<Browser> => {
    if (browser) await close();
    return (browser = connectScrapeless(scrapeless ?? {}));
  };

  const close = async () => {
    if (!browser) return;
    try {
      await (await browser).close();
    } catch {
      // ignore error
    } finally {
      browser = undefined;
    }
  };

  const newPage = async () => {
    if (!browser) {
      browser = connect();
    } else if (!(await browser).connected) {
      browser = connect();
    }

    try {
      const page = await (await browser).newPage();
      first = true;
      return page;
    } catch {
      browser = connect();
      const page = await (await browser).newPage();
      first = true;
      return page;
    }
  };

  return {
    fetch: async (pathname, { selector } = {}) => {
      let page = await newPage();

      const url = new URL(pathname, BASE_URL);

      const filename = pathname
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/\.html$/, '.png')
        .replace('catalog', 'catalog.png');

      for (let turn = 0; turn < MAX_RETRY; turn++) {
        try {
          if (page.isClosed()) {
            page = await newPage();
          }

          if (first) {
            first = false;
          } else {
            await sleep(delayInterval + Math.random() * delayInterval);
          }

          consola.log(`Start navigating to ${url.toString()}`);

          await page.goto(url.toString(), { timeout: 60 * 1000, waitUntil: 'domcontentloaded' });

          if (selector) {
            await page.waitForSelector(selector);
          }

          consola.log(`Finish navigating to ${url.toString()}`);

          const content = await page.content();

          return content;
        } catch (error) {
          consola.error(error);

          await fs.mkdir('.screenshot').catch(() => {});

          await page
            .screenshot({
              path: path.join('.screenshot', filename),
              fullPage: true
            })
            .catch(() => {});

          if (turn + 1 === MAX_RETRY) {
            throw error;
          }

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
