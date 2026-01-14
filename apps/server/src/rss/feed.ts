import { Author, Feed } from 'feed';

import type { Context } from '../app';

export type FeedEntry = {
  title: string;
  link: string;
  id?: string;
  description?: string;
  content?: string;
  date: Date | string | number;
  author?: Author[];
  categories?: string[];
  image?: string;
};

export type FeedOptions = {
  id?: string;

  title: string;
  description: string;
  link: string;
  rssLink: string;
  author?: Author;
  image?: string | null | undefined;
  language?: string;
  copyright?: string;
  items: FeedEntry[];

  // follow challenge
  follow?: {
    feedId?: string;
    userId?: string;
  };
};

export function getFeedString(options: FeedOptions): string {
  const feed = new Feed({
    id: options.id || options.link,
    title: options.title,
    description: options.description,
    link: options.link,
    feedLinks: { rss: options.rssLink },
    author: options.author,
    image: options.image || undefined,
    language: options.language || 'zh',
    copyright: options.copyright || '内容来源于互联网，版权归原作者或原网站所有。',
    generator: 'lnovel.animes.garden'
  });

  if (options.follow && options.follow.feedId && options.follow.userId) {
    feed.addExtension({
      name: 'follow_challenge',
      objects: {
        feedId: options.follow.feedId,
        userId: options.follow.userId
      }
    });
  }

  options.items.forEach((item) => {
    feed.addItem({
      title: item.title,
      id: item.id ?? item.link,
      link: item.link,
      author: item.author ? item.author : options.author ? [options.author] : undefined,
      description: item.description,
      content: item.content,
      date: new Date(item.date),
      image: item.image,
      category: item.categories?.map((name) => ({ name }))
    });
  });

  return feed.rss2();
}

export function getFeedResponse(ctx: Context, options: FeedOptions) {
  const xml = getFeedString(options);
  ctx.res.headers.set('Content-Type', 'application/xml; charset=UTF-8');
  return ctx.body(xml);
}
