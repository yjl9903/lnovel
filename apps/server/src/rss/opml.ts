import { escape } from './utils';

export type OpmlOutline = {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  text?: string;
  description?: string;
  type?: string;
};

export type BuildOpmlOptions = {
  title: string;
  description?: string;
  ownerName?: string;
  ownerEmail?: string;
  docs?: string;
  items: OpmlOutline[];
};

export function getOpmlString(options: BuildOpmlOptions): string {
  const headParts = [
    `<title>${escape(options.title)}</title>`,
    options.description ? `<description>${escape(options.description)}</description>` : null,
    options.ownerName ? `<ownerName>${escape(options.ownerName)}</ownerName>` : null,
    options.ownerEmail ? `<ownerEmail>${escape(options.ownerEmail)}</ownerEmail>` : null,
    options.docs ? `<docs>${escape(options.docs)}</docs>` : null
  ].filter(Boolean) as string[];

  const outlines = options.items
    .map((item) => {
      const attrs = {
        text: item.text ?? item.title,
        title: item.title,
        type: item.type ?? 'rss',
        xmlUrl: item.xmlUrl,
        htmlUrl: item.htmlUrl,
        description: item.description
      };
      const attrString = Object.entries(attrs)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}="${escape(String(value))}"`)
        .join(' ');

      return `    <outline ${attrString} />`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head>${headParts.join('')}</head>`,
    '  <body>',
    outlines,
    '  </body>',
    '</opml>'
  ]
    .filter((line) => line !== '')
    .join('\n');
}
