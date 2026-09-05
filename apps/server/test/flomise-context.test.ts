import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import { createEngine, newQueue, workflow, type Queue } from 'flomise';

describe('flomise async context contract', () => {
  it('preserves queued add/all submitters after a previous job rejects', async () => {
    const context = new AsyncLocalStorage<string>();
    const queue = newQueue(1);
    const gate = Promise.withResolvers<void>();
    const seen: Array<string | undefined> = [];
    const first = context.run('A', () =>
      queue.add(async () => {
        await gate.promise;
        seen.push(context.getStore());
        throw new Error('expected');
      })
    );
    const rejected = expect(first).rejects.toThrow('expected');
    const second = context.run('B', () =>
      queue.add(async () => {
        await Promise.resolve();
        seen.push(context.getStore());
        return 'B';
      })
    );
    const third = context.run('C', () =>
      queue.all([
        async () => {
          seen.push(context.getStore());
          return 'C';
        },
        Promise.resolve('already resolved')
      ])
    );
    gate.resolve();
    await rejected;
    expect(await second).toBe('B');
    expect(await third).toEqual(['C', 'already resolved']);
    await queue.done();
    expect(seen).toEqual(['A', 'B', 'C']);
    expect(context.getStore()).toBeUndefined();
    expect(queue.active()).toBe(0);
    expect(queue.size()).toBe(0);
  });

  it('restores execution context with a custom queue, including hooks, retries and cache access', async () => {
    const context = new AsyncLocalStorage<string>();
    const worker = newQueue(1);
    // Model a scheduler which invokes callbacks from its own unrelated context.
    const queue: Queue = {
      ...worker,
      add: (action) => context.run('worker', () => worker.add(action))
    };
    const engine = createEngine();
    const cache = new Map<string, string>();
    const seen: Array<[string, string | undefined]> = [];
    let attempts = 0;
    const job = workflow('custom', {
      concurrency: queue,
      retry: { max: 1, delay: 1 },
      cache: {
        get: async (key) => {
          await Promise.resolve();
          seen.push(['cache.get', context.getStore()]);
          return cache.get(key);
        },
        set: (key, value) => {
          seen.push(['cache.set', context.getStore()]);
          cache.set(key, value as string);
        },
        delete: (key) => cache.delete(key),
        clear: () => cache.clear()
      }
    })
      .input((id: string) => id)
      .hook('pre:exec', () => {
        seen.push(['pre', context.getStore()]);
      })
      .hook('post:exec', () => {
        seen.push(['post', context.getStore()]);
      })
      .action(async (_, id) => {
        await Promise.resolve();
        seen.push(['action', context.getStore()]);
        if (++attempts === 1) throw new Error('retry');
        return id;
      });

    expect(await context.run('caller', () => engine.run({}, job, 'key'))).toBe('key');
    expect(seen).toEqual([
      ['cache.get', 'caller'],
      ['pre', 'caller'],
      ['action', 'caller'],
      ['pre', 'caller'],
      ['action', 'caller'],
      ['cache.set', 'caller'],
      ['post', 'caller']
    ]);
    seen.length = 0;
    expect(await context.run('cached-caller', () => engine.run({}, job, 'key'))).toBe('key');
    expect(seen).toEqual([['cache.get', 'cached-caller']]);
    expect(attempts).toBe(2);
    expect(context.getStore()).toBeUndefined();
  });
});
