import { eq } from 'drizzle-orm';

import { folos } from './schema';
import { database } from './database';

export const FOLLOW_USER_ID = '41508082357911552';

export async function getFoloFeedId(url: string) {
  const [resp] = await database.select().from(folos).where(eq(folos.url, url));
  if (resp) {
    return resp.feedId;
  }
}

export async function setFoloFeedId(url: string) {
  if (!process.env.FOLO) return undefined;

  const feedId = await getFoloFeedId(url);
  if (feedId) return feedId;

  const resp = await fetch(`https://api.folo.is/feeds?url=${encodeURIComponent(url)}`);
  if (resp.ok) {
    const body = await resp.json();
    // @ts-ignore
    const feedId = body?.data?.feed?.id;
    if (feedId && typeof feedId === 'string') {
      await database.insert(folos).values({ url, feedId });
      return feedId;
    }
  }
}
