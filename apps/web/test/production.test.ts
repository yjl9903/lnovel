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
        env: { ...process.env, DATABASE_FILE: '/nonexistent/do-not-open.db' },
        stdio: 'pipe'
      }
    );
    let output = '';
    child.stdout!.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/Start listening on (http:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
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
        /@lnovel\/server|node:sqlite|cloakbrowser|playwright|DATABASE_FILE|SCRAPELESS_TOKEN/
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

  it('keeps the old page fallback and API errors separate', async () => {
    expect(await (await fetch(`${origin}/old/page`)).text()).toContain('测试小说 1');
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
