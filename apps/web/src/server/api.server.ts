import { initializeLogging } from '@lnovel/server/logging';

initializeLogging({ serviceName: 'lnovel-web' });

const { createApp } = await import('@lnovel/server');

// One API container shared by the gateway and SSR. This module is server-only.
export const serverApp = createApp();
