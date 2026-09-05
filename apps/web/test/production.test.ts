import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcess;
let origin: string;
beforeAll(async () => {
  origin = await new Promise<string>((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        '--import',
        fileURLToPath(new URL('./fixtures/loader.mjs', import.meta.url)),
        fileURLToPath(new URL('../cli.mjs', import.meta.url)),
        '--host',
        '127.0.0.1',
        '--port',
        '0'
      ],
      {
        cwd: os.tmpdir(),
        env: { ...process.env, LOG_LEVEL: 'info', DATABASE_FILE: '/nonexistent/do-not-open.db' },
        stdio: 'pipe'
      }
    );
    let output = '';
    child.stdout!.on('data', (chunk) => {
      output += chunk.toString();
      for (const line of output.split('\n')) {
        try {
          const log = JSON.parse(line);
          if (log.attributes?.event === 'server.started') {
            resolve(`http://127.0.0.1:${log.attributes.port}`);
          }
        } catch {
          /* Wait for a complete JSON line. */
        }
      }
    });
    child.stderr!.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Web exited (${code}): ${output}`)));
  });
}, 15_000);
afterAll(async () => {
  if (child && child.exitCode === null) {
    const closed = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await closed;
  }
});

describe('production web bundle', () => {
  it('keeps server dependencies out of client JavaScript', async () => {
    const assets = new URL('../dist/client/assets/', import.meta.url);
    for (const file of await readdir(assets)) {
      if (!file.endsWith('.js')) continue;
      const source = await readFile(new URL(file, assets), 'utf8');
      expect(source).not.toMatch(
        /@lnovel\/server|node:sqlite|cloakbrowser|playwright|DATABASE_FILE|SCRAPELESS_TOKEN|@opentelemetry|JsonLogRecordExporter|LoggerProvider/
      );
    }
  });

  it('renders the home data on the server through the same in-memory API', async () => {
    const before = await (await fetch(`${origin}/health`)).json();
    const response = await fetch(origin);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('测试小说 1');
    expect(html).toContain('测试小说 9');
    expect(html).toContain('lang="zh-Hans"');
    expect(html).toContain('fd9582a9-0a42-45d4-9e50-e9d9b410a1dc');
    const after = await (await fetch(`${origin}/health`)).json();
    expect(after.calls - before.calls).toBe(1);
  });

  it('serves assets independently of the current working directory', async () => {
    const html = await (await fetch(origin)).text();
    const css = html.match(/href="([^"]+\.css)"/)?.[1];
    expect(css).toBeTruthy();
    const response = await fetch(new URL(css!, origin));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${origin}/favicon.ico`)).status).toBe(200);
    expect((await fetch(`${origin}/robots.txt`)).status).toBe(200);
  });

  it.each(['/', '/?utm_source=test'])(
    'renders complete home SEO in the original HTML at %s',
    async (path) => {
      const response = await fetch(`${origin}${path}`, {
        headers: { 'x-forwarded-host': 'other.example', 'x-forwarded-proto': 'http' }
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      const head = html.match(/<head>([\s\S]*?)<\/head>/)![1];
      expect(head.match(/<title>.*?<\/title>/g)).toEqual(['<title>lnovel 轻小说聚合站</title>']);
      expect(head.match(/<link[^>]*rel="canonical"[^>]*>/g)).toEqual([
        '<link rel="canonical" href="https://lnovel.animes.garden/"/>'
      ]);
      expect(head).toContain(
        'name="description" content="从哔哩轻小说、轻小说文库等站点抓取书籍, 提供轻小说开放接口和 RSS 订阅."'
      );
      expect(head.match(/<meta name="robots"[^>]*>/g)).toEqual([
        '<meta name="robots" content="index, follow"/>'
      ]);
      for (const [property, content] of [
        ['og:type', 'website'],
        ['og:site_name', 'lnovel 轻小说聚合站'],
        ['og:title', 'lnovel 轻小说聚合站'],
        ['og:url', 'https://lnovel.animes.garden/'],
        ['og:locale', 'zh_CN']
      ]) {
        expect(head).toContain(`property="${property}" content="${content}"`);
      }
      expect(head).toContain('property="og:description"');
      expect(head).toContain('name="twitter:card" content="summary"');
      expect(head).toContain('name="twitter:title" content="lnovel 轻小说聚合站"');
      expect(head).toContain('name="twitter:description"');
      const structuredData = [
        ...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
      ];
      expect(structuredData).toHaveLength(1);
      expect(JSON.parse(structuredData[0][1])).toEqual({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'lnovel 轻小说聚合站',
        url: 'https://lnovel.animes.garden/',
        description: '从哔哩轻小说、轻小说文库等站点抓取书籍, 提供轻小说开放接口和 RSS 订阅.',
        inLanguage: 'zh-Hans'
      });
    }
  );

  it('serves crawler documents from the production gateway', async () => {
    const before = await (await fetch(`${origin}/health`)).json();
    for (const [path, contentType, content] of [
      ['/robots.txt', 'text/plain', 'Sitemap: https://lnovel.animes.garden/sitemap.xml'],
      ['/sitemap.xml', 'application/xml', '<loc>https://lnovel.animes.garden/</loc>']
    ]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(contentType);
      expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
      expect(await response.text()).toContain(content);
      const head = await fetch(`${origin}${path}`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toBe(response.headers.get('content-type'));
      expect(head.headers.get('cache-control')).toBe(response.headers.get('cache-control'));
      expect(await head.text()).toBe('');
    }
    const after = await (await fetch(`${origin}/health`)).json();
    expect(after.calls).toBe(before.calls);
  });

  it('returns an unindexed 404 without fetching home data, and preserves API errors', async () => {
    const before = await (await fetch(`${origin}/health`)).json();
    for (const path of ['/old/page', '/bilingual', '/missing.css', '/sitemap.xml/missing']) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain('页面不存在');
      expect(html).toMatch(/<a[^>]*href="\/"[^>]*>返回首页<\/a>/);
      expect(html).not.toContain('测试小说 1');
      const head = html.match(/<head>([\s\S]*?)<\/head>/)![1];
      expect(head.match(/<title>.*?<\/title>/g)).toEqual(['<title>页面不存在 · lnovel</title>']);
      expect(head).toContain('name="robots" content="noindex"');
      expect(head).not.toMatch(
        /rel="canonical"|property="og:|name="twitter:|application\/ld\+json/
      );
    }
    const after = await (await fetch(`${origin}/health`)).json();
    expect(after.calls).toBe(before.calls);
    expect((await fetch(`${origin}/bili/missing`)).status).toBe(404);
  });

  it('renders loading on SSR failure and isolates simultaneous requests', async () => {
    const [failed, empty, full] = await Promise.all([
      fetch(origin, { headers: { cookie: 'fixture=error' } }),
      fetch(origin, { headers: { cookie: 'fixture=empty' } }),
      fetch(origin)
    ]);
    expect(failed.status).toBe(200);
    expect(await failed.text()).toContain('space-y-3');
    expect(await empty.text()).not.toContain('测试小说 1');
    expect(await full.text()).toContain('测试小说 1');
  });
});
