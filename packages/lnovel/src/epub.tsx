import * as path from 'node:path';

import { Epubook, XHTMLBuilder, Image } from 'epubook';

import { Book } from './providers/base';

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
        return new XHTMLBuilder(file)
          .title(props.title)
          .body(<h2>{props.title}</h2>)
          .body(<div html={props.content}></div>);
      }
    }
  });

  const images = (
    await Promise.all(
      book.images.map((i) => {
        return epubook.image(path.join(book.root, i));
      })
    )
  ).filter(Boolean) as Image[];

  const pics = book.contents.findIndex((c) => c.title.indexOf('插图') !== -1);

  const pages = book.contents.map((c) => {
    const content =
      images.length > 0 ? c.content.replace(/__IMAGE_ROOT__/g, '../images') : c.content;
    return epubook.page('content', { title: c.title, content });
  });

  const cover = book.cover ? [await epubook.cover(path.join(book.root, book.cover))] : [];

  epubook.toc(
    ...cover,
    ...pages.filter((_c, idx) => idx === pics),
    ...pages.filter((_c, idx) => idx !== pics)
  );

  return epubook;
}
