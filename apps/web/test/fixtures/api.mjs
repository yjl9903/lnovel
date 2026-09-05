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

export function createApp() {
  const app = new Hono();
  let calls = 0;
  app.get('/health', (c) => c.json({ ok: true, calls }));
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
