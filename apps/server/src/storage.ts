import { createStorage } from 'unstorage';
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding';
import type { Context } from './app';

// export function connectBrowserStorage(c: Context) {
//   return createStorage({
//     driver: cloudflareKVBindingDriver({ binding: c.env.lnovel_browser })
//   });
// }

// export function connectDataStorage(c: Context) {
//   return createStorage({
//     driver: cloudflareKVBindingDriver({ binding: c.env.lnovel_data })
//   });
// }
