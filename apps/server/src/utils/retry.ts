import type { ConsolaInstance } from 'consola';

export interface RetryOptions {
  logger?: ConsolaInstance;
  signal?: AbortSignal;
}

export async function retryFn<T>(
  fn: (options: RetryOptions) => Promise<T>,
  count: number,
  options: RetryOptions = {}
): Promise<T> {
  if (count < 0) {
    count = Number.MAX_SAFE_INTEGER;
  }
  let delay = 500;
  let e: any;
  for (let i = 0; i <= count; i++) {
    try {
      return await fn(options);
    } catch (err) {
      e = err;
      if (options?.signal?.aborted) {
        break;
      }

      if (options.logger && i < count) {
        options.logger.error(`Retry ${i + 1} / ${count}, due to`, err);
      }

      await sleep(delay);
      delay = Math.min(delay * 2, 30 * 1000);
    }
  }
  throw e;
}

export function sleep(timeout?: number) {
  return new Promise<void>((res) => {
    setTimeout(() => res(), timeout);
  });
}
