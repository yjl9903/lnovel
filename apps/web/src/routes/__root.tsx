import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts
} from '@tanstack/react-router';
import stylesheet from '../index.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      // The home route overrides these defaults; unmatched pages stay unindexed.
      { title: '页面不存在 · lnovel' },
      { name: 'robots', content: 'noindex' }
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'stylesheet', href: stylesheet }
    ]
  }),
  notFoundComponent: () => (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-slate-900">
      <p className="text-sm text-slate-500">404</p>
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <Link to="/" className="underline underline-offset-4">
        返回首页
      </Link>
    </main>
  ),
  component: () => (
    <html lang="zh-Hans">
      <head>
        <HeadContent />
        <script
          defer
          src="https://umami.onekuma.cn/script.js"
          data-website-id="fd9582a9-0a42-45d4-9e50-e9d9b410a1dc"
        />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
});
