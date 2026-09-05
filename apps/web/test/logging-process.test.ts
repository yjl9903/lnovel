import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const children = new Set<ChildProcess>();
afterEach(() => {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  children.clear();
});

async function startLoggingProcess(blocked = false) {
  const url = new URL('../../server/dist/logging.mjs', import.meta.url).href;
  const script = `
    import { initializeLogging, createLogger, addShutdownHook, installProcessHandlers } from ${JSON.stringify(url)};
    initializeLogging({ serviceName: 'process-test', write(line, done) {
      if (${blocked} && JSON.parse(line).attributes.event !== 'test.ready') return;
      process.stdout.write(line, done);
    }});
    installProcessHandlers();
    installProcessHandlers();
    const logger = createLogger('test');
    const timer = setInterval(() => {}, 1000);
    addShutdownHook(async () => {
      clearInterval(timer);
      await new Promise(resolve => setTimeout(resolve, 10));
      logger.info('Stop hook drained', { event: 'test.drained' });
    });
    logger.info('Ready', { event: 'test.ready' });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, LOG_LEVEL: 'info', DATABASE_FILE: '/nonexistent/do-not-open.db' },
    stdio: 'pipe'
  });
  children.add(child);
  let stdout = '',
    stderr = '';
  child.stdout!.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr!.on('data', (chunk) => {
    stderr += chunk;
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }
  );
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (stdout.includes('test.ready')) resolve();
    };
    child.stdout!.on('data', check);
    child.once('error', reject);
    child.once('close', () => reject(new Error(`Logging process exited before ready: ${stderr}`)));
  });
  return { child, exit, output: () => ({ stdout, stderr }) };
}

describe('logging process lifecycle', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'drains the standalone logging entry on %s',
    async (signal) => {
      const process = await startLoggingProcess();
      process.child.kill(signal);
      expect(await process.exit).toEqual({ code: 0, signal: null });
      const records = process
        .output()
        .stdout.trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(records.map((record) => record.attributes.event)).toEqual([
        'test.ready',
        'server.stopping',
        'test.drained'
      ]);
      expect(process.output().stderr).toBe('');
    }
  );

  it('exits within the deadline when the output never acknowledges writes', async () => {
    const process = await startLoggingProcess(true);
    const started = performance.now();
    process.child.kill('SIGTERM');
    expect(await process.exit).toEqual({ code: 0, signal: null });
    expect(performance.now() - started).toBeLessThan(4000);
    expect(process.output().stderr).toContain('Log drain timed out');
  }, 6000);
});
