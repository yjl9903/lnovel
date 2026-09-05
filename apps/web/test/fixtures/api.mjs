import { Hono } from 'hono';

export const items = Array.from({ length: 9 }, (_, index) => ({
  nid: index + 1,
  cover: '/bili/files/cover.jpg',
  title: `测试小说 ${index + 1}`,
  author: '测试作者',
  library: '测试文库',
  status: '连载中',
  description: '用于页面回归验证的小说简介。保持原有版式与交互。',
  latestChapter: '第一章',
  rank: index + 1,
  follow: { feedId: `fixture-${index + 1}` }
}));

export const novel = {
  nid: 1,
  name: '测试小说 1',
  authors: [
    { name: '测试作者', position: 'author' },
    { name: '测试画师', position: 'illustrator' }
  ],
  labels: ['奇幻', '冒险'],
  description:
    '<p>第一段 &amp; 简介<br>\n换行内容</p>\n  <p>第二段 &lt;文字&gt;</p><script>unsafeScript()</script>',
  cover: '/bili/files/cover.jpg',
  updatedAt: '2026-09-05T18:30:00.000Z',
  volumes: [
    { nid: 1, vid: 10, title: '第一卷 起点', volume: '第一卷', cover: '/bili/files/cover.jpg' },
    { nid: 1, vid: 20, title: '第二卷 新的旅程', volume: '第二卷', cover: '' }
  ],
  follow: { feedId: 'fixture-1' }
};

export function createApp() {
  const app = new Hono();
  let calls = 0;
  let novelCalls = 0;
  app.get('/health', (c) => c.json({ ok: true, calls, novelCalls }));
  app.get('/api/bili/novel/:nid', (c) => {
    novelCalls++;
    const nid = Number(c.req.param('nid'));
    const cookie = c.req.header('cookie') || '';
    if (nid === 404) return c.json({ ok: false }, 404);
    if (cookie.includes('fixture=error')) return c.json({ ok: false }, 500);
    if (cookie.includes('fixture=timeout')) return new Response('timeout', { status: 408 });
    if (cookie.includes('fixture=invalid')) return c.json({ ok: true });
    const empty = cookie.includes('fixture=empty');
    return c.json({
      ok: true,
      data: {
        ...novel,
        nid,
        name: `测试小说 ${nid}`,
        isDeleted: cookie.includes('fixture=deleted'),
        ...(empty
          ? { authors: [], labels: [], description: '', cover: '', volumes: [], follow: undefined }
          : {})
      }
    });
  });
  app.get('/api/bili/top/weekvisit', (c) => {
    calls++;
    const cookie = c.req.header('cookie') || '';
    if (cookie.includes('fixture=error')) return c.json({ ok: false }, 500);
    const data = cookie.includes('fixture=empty') ? [] : items;
    return c.json({ ok: true, data: { title: cookie, items: data } });
  });
  return app;
}

export async function startCron() {
  console.log('fixture cron started');
}
