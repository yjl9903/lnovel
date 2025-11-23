/// <reference types="@cloudflare/workers-types" />

import type { Context as HonoContext } from 'hono';

export type ServiceBindings = {};

export type AppVariables = {
  requestId: string;
};

export type AppEnv = {
  Bindings: ServiceBindings;
  Variables: AppVariables;
};

export type Context = HonoContext<AppEnv>;
