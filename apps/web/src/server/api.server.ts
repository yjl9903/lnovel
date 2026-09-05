import { createApp } from '@lnovel/server';

// One API container shared by the gateway and SSR. This module is server-only.
export const serverApp = createApp();
