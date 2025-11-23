/// <reference types="@cloudflare/workers-types" />

import type { Context as HonoContext } from 'hono';

export type ServiceBindings = {
  BROWSER: Fetcher;
  lnovel_data: KVNamespace;
  lnovel_browser: KVNamespace;
};

export type AppVariables = {
  requestId: string;
};

export type AppEnv = {
  Bindings: ServiceBindings;
  Variables: AppVariables;
};

export type Context = HonoContext<AppEnv>;
