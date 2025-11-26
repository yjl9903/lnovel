import type { Context } from './app';

export async function launchBrowser<T>(c: Context, fn: () => Promise<T>) {
  // const browser = await connectSession(c);
  // const page = await browser.newPage();
  // await page.setExtraHTTPHeaders({
  //   Accept: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`,
  //   'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6'
  // });
  // await page.setUserAgent(
  //   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0'
  // );
  // await page.setViewport({
  //   width: 2160,
  //   height: 1080,
  //   deviceScaleFactor: 2
  // });
  // try {
  //   const result = await fn(page, browser);
  //   return result;
  // } catch (error) {
  //   console.error('[browser]', error);
  //   throw error;
  // } finally {
  //   await browser.disconnect();
  // }
}

// async function connectSession(c: Context): Promise<Browser> {
//   const sessions: ActiveSession[] = await puppeteer.sessions(c.env.BROWSER);

//   console.log('[browser]', 'sessions', sessions);

//   const sessionsIds = sessions
//     .filter((v) => {
//       return !v.connectionId; // remove sessions with workers connected to them
//     })
//     .map((v) => {
//       return v.sessionId;
//     });

//   if (sessionsIds.length === 0) {
//     const browser = await puppeteer.launch(c.env.BROWSER);
//     console.log('[browser]', 'session created', browser.sessionId());
//     return browser;
//   }

//   const sessionId = sessionsIds[Math.floor(Math.random() * sessionsIds.length)];
//   if (sessionId) {
//     try {
//       const browser = await puppeteer.connect(c.env.BROWSER, sessionId);
//       console.log('[browser]', 'session connected', sessionId);
//       return browser;
//     } catch (e) {
//       // another worker may have connected first
//       console.error(`[browser]`, 'failed to connect session', sessionId, e);
//       throw e;
//     }
//   }

//   const browser = await puppeteer.launch(c.env.BROWSER);
//   console.log('[browser]', 'session created', browser.sessionId());

//   return browser;
// }
