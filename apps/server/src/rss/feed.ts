import { Feed } from 'feed';

import type { Context } from '../app';

export type FeedEntry = {
  title: string;
  link: string;
  id?: string;
  description?: string;
  content?: string;
  date: Date | string | number;
  categories?: string[];
  image?: string;
};

export type FeedOptions = {
  title: string;
  description: string;
  link: string;
  rssLink: string;
  image?: string | null | undefined;
  language?: string;
  copyright?: string;
  items: FeedEntry[];
};

export function getFeedString(options: FeedOptions): string {
  const feed = new Feed({
    id: options.link,
    title: options.title,
    description: options.description,
    link: options.link,
    feedLinks: { rss: options.rssLink },
    image: options.image || undefined,
    language: options.language || 'zh',
    Xcopyright: options.copyright || '内容来源于互联网，版权归原作者或原网站所有。',
    generator: 'lnovel'
  });

  options.items.forEach((item) => {
    feed.addItem({
      title: item.title,
      id: item.id ?? item.link,
      link: item.link,
      description: item.description,
      content: item.content,
      date: new Date(item.date),
      image: item.image,
      category: item.categories?.map((name) => ({ name }))
    });
  });

  return feed.rss2();
}

export function getFeedResponse(ctx: Context, options: FeedOptions): Response {
  const xml = getFeedString(options);
  ctx.res.headers.set('Content-Type', 'application/xml; charset=UTF-8');
  return ctx.body(xml);
}
