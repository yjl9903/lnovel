import * as path from 'node:path';

import { Epubook, XHTMLBuilder } from 'epubook';

import { Book } from './providers/base';
import { padNumber } from './utils';

export async function bundle(book: Book): Promise<Epubook> {
  const epubook = (
    await Epubook.create({
      title: `${book.novel.name} ${book.volume.name}`,
      description: book.novel.description,
      author: [{ name: book.novel.author, fileAs: book.novel.author }],
      publisher: book.novel.publisher,
      lastModified: book.novel.lastUpdateTime
    })
  ).extend({
    pages: {
      content(file, props: { title: string; content: string }) {
        return new XHTMLBuilder(file).title(props.title).body(<div html={props.content}></div>);
      }
    }
  });

  const pages = book.contents.map((c) => {
    return epubook.page('content', { title: c.title, content: c.content });
  });

  const images = await Promise.all(
    book.images.map((i) => {
      return epubook.image(path.join(book.root, i));
    })
  );

  const cover = book.cover ? [await epubook.cover(path.join(book.root, book.cover))] : [];

  epubook.toc(...cover, ...pages);

  return epubook;
}
