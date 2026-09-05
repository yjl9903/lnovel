import { eq } from 'drizzle-orm';

import { folos } from './schema';
import { database } from './database';
import { createLogger, safeUrl } from './logging';

const logger = createLogger('folo');

export function getFoloShareURL(feedId: string) {
  return `https://app.folo.is/share/feeds/${feedId}`;
}

export function getFoloUserId() {
  return process.env.FOLLOW_USER_ID;
}

export async function getFoloFeedId(url: string) {
  try {
    if (!getFoloUserId()) return undefined;

    const [resp] = await database.select().from(folos).where(eq(folos.url, url));
    if (resp) {
      return resp.feedId;
    }
  } catch {
    return undefined;
  }
}

export async function setFoloFeedId(url: string | URL) {
  try {
    if (!getFoloUserId()) return undefined;

    if (url instanceof URL) url = url.toString();

    const feedId = await getFoloFeedId(url);
    if (feedId) return feedId;

    const resp = await fetch(`https://api.folo.is/feeds?url=${encodeURIComponent(url)}`);
    if (resp.ok) {
      const body = await resp.json();
      // @ts-ignore
      const feedId = body?.data?.feed?.id;
      if (feedId && typeof feedId === 'string') {
        await database.insert(folos).values({ url, feedId });
        logger.info('Folo feed updated', {
          event: 'folo.feed.updated',
          feed_url: safeUrl(url),
          feed_id: feedId
        });
        return feedId;
      }
    }
  } catch {}
}
