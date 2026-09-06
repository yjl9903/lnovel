import type { Novel } from '../../src/lib/novel';

export const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5V8AAAAASUVORK5CYII=',
    'base64'
  )
);
export const epubNovel: Novel = {
  nid: 1,
  name: '测试小说 & <书名>',
  authors: [
    { name: '作者甲', position: 'author' },
    { name: '插画 & <乙>', position: 'illustrator' }
  ],
  labels: [],
  description: '小说简介',
  updatedAt: '2026-09-05T00:00:00Z',
  volumes: [{ nid: 1, vid: 10, title: '第一卷', volume: '第一卷', cover: '/bili/files/cover.jpg' }]
};
export const epubVolume = {
  nid: 1,
  vid: 10,
  done: true,
  cover: 'https://old.example/bili/files/cover.jpg',
  description: '<p>卷简介 &amp; 内容</p>',
  updatedAt: '2026-09-05T00:00:00Z',
  chapters: [
    { nid: 1, vid: 10, cid: 102, title: '第二编号先读' },
    { nid: 1, vid: 10, cid: 101, title: '第一编号后读' }
  ]
};
export const epubChapters = [
  {
    ...epubVolume.chapters[0],
    content:
      '<center>居中</center><p onclick="bad()">中文 &amp; &nbsp; 正文<br>换行<ruby>字<rt>zi</rt></ruby></p><script>bad()</script><a href="javascript:bad()">文字</a><img src="https://www.linovelib.com/files/cover.jpg" alt="封面复用"><img data-src="https://img3.readpai.com/illustration.jpg" src="/placeholder.jpg">'
  },
  {
    ...epubVolume.chapters[1],
    content: '<p>末章 &lt;文字&gt;</p><img src="/bili/img3/illustration.jpg">'
  }
];
export function epubResponse(url: string) {
  const pathname = new URL(url).pathname;
  if (pathname === '/api/bili/novel/1/vol/10') return Response.json({ ok: true, data: epubVolume });
  const chapter = epubChapters.find((chapter) => pathname.endsWith('/chapter/' + chapter.cid));
  if (chapter) return Response.json({ ok: true, data: chapter });
  if (pathname.startsWith('/bili/'))
    return new Response(png, { headers: { 'Content-Type': 'image/jpeg' } });
  return new Response(null, { status: 404 });
}
