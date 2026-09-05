import { registerHooks } from 'node:module';

// Production smoke tests exercise the actual web bundle with a deterministic API,
// without accessing the user's SQLite database or upstream scraping services.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@lnovel/server' || specifier.endsWith('/apps/server/dist/index.mjs')) {
      return { url: new URL('./api.mjs', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
