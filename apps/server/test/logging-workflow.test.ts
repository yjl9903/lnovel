import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine, newQueue, workflow } from 'flomise';
import {
  createLogger,
  initializeLogging,
  withLogContext,
  getLogContext,
  runTask,
  scheduleTask
} from '../src/logging';

const records: any[] = [];
const runtime = initializeLogging({
  level: 'debug',
  write: (line, done) => {
    records.push(JSON.parse(line));
    done();
  }
});
beforeEach(async () => {
  await runtime.forceFlush();
  records.length = 0;
});

describe('workflow correlation', () => {
  it('preserves queued submitters while deduplicating actual execution and linking nested tasks', async () => {
    const engine = createEngine();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const contexts: any[] = [];
    const nested = workflow('nested', { concurrency: 1 })
      .input((id: number) => String(id))
      .action(async (ctx, id) =>
        runTask(ctx.workflow.scope, { novel_id: id }, async () => {
          contexts.push({ ...getLogContext(), kind: 'nested' });
          return id;
        })
      );
    const root = workflow('root', { concurrency: 1 })
      .input((id: number) => String(id))
      .action(async (ctx, id) =>
        runTask(ctx.workflow.scope, { novel_id: id }, async () => {
          contexts.push({ ...getLogContext(), kind: 'root' });
          if (id === 1) {
            started();
            await blocked;
          }
          await ctx.run(nested, id);
          return id;
        })
      );
    const resumed: any[] = [];
    const submit = (request_id: string, id: number) =>
      withLogContext({ request_id }, async () => {
        createLogger('test').info('Workflow requested', {
          event: 'workflow.requested',
          workflow: root.scope,
          workflow_key: root.key(id)
        });
        const result = await engine.run({}, root, id);
        resumed.push({ ...getLogContext() });
        return result;
      });
    const first = submit('request-A', 1);
    await entered;
    const shared = submit('request-B', 1);
    const queued = submit('request-C', 2);
    release();
    expect(await Promise.all([first, shared, queued])).toEqual([1, 1, 2]);
    await runtime.forceFlush();
    const roots = contexts.filter((context) => context.kind === 'root');
    expect(roots).toHaveLength(2);
    expect(new Set(roots.map((context) => context.task_id)).size).toBe(2);
    expect(resumed.map((context) => context.request_id).sort()).toEqual([
      'request-A',
      'request-B',
      'request-C'
    ]);
    expect(resumed.every((context) => !context.task_id)).toBe(true);
    expect(roots.map((context) => context.trigger_request_id)).toEqual(['request-A', 'request-C']);
    expect(contexts.every((context) => !context.request_id)).toBe(true);
    for (const child of contexts.filter((context) => context.kind === 'nested')) {
      expect(child.parent_task_id).toBe(
        roots.find((root) => root.novel_id === child.novel_id).task_id
      );
    }
    const callers = records.filter(
      (record) =>
        record.attributes.event === 'workflow.requested' && record.attributes.workflow === 'root'
    );
    expect(callers.map((record) => record.attributes.request_id)).toEqual([
      'request-A',
      'request-B',
      'request-C'
    ]);
  });

  it('keeps shared queues isolated across workflows and does not create tasks for cache hits', async () => {
    const engine = createEngine();
    const queue = newQueue(1);
    const seen: string[] = [];
    const cache = new Map<string, number>();
    const make = (name: string) =>
      workflow(name, { concurrency: queue, cache })
        .input((id: number) => String(id))
        .action(async (ctx, id) =>
          runTask(ctx.workflow.scope, {}, async () => {
            await Promise.resolve();
            seen.push(getLogContext().trigger_request_id!);
            return id;
          })
        );
    const one = make('one'),
      two = make('two');
    await Promise.all([
      withLogContext({ request_id: 'A' }, () => engine.run({}, one, 1)),
      withLogContext({ request_id: 'B' }, () => engine.run({}, two, 2))
    ]);
    await withLogContext({ request_id: 'cached' }, () => engine.run({}, one, 1));
    expect(seen).toEqual(['A', 'B']);
  });

  it('captures delayed task origin and contains rejected background work', async () => {
    const result = new Promise<any>((resolve) => {
      withLogContext({ request_id: 'origin', task_id: 'parent' }, () =>
        scheduleTask(
          'delayed',
          { novel_id: 42 },
          async () => {
            resolve(getLogContext());
            throw new Error('expected');
          },
          1
        )
      );
    });
    const context = await result;
    expect(context).toMatchObject({
      trigger_request_id: 'origin',
      parent_task_id: 'parent',
      novel_id: 42
    });
    expect(context.request_id).toBeUndefined();
    expect(context.task_id).not.toBe('parent');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runtime.forceFlush();
    expect(records.some((record) => record.attributes.event === 'task.failed')).toBe(true);
  });
});
