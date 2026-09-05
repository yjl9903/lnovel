# Web 架构

代码位于 `apps/web`。主要入口为 [`src/server.ts`](../../apps/web/src/server.ts)、[`src/router.tsx`](../../apps/web/src/router.tsx)、[`src/routes/index.tsx`](../../apps/web/src/routes/index.tsx) 和 [`cli.mjs`](../../apps/web/cli.mjs)。

## 网关与服务端边界

`src/server/gateway.ts` 按顺序处理请求：

1. `/robots.txt` 和 `/sitemap.xml`，支持 GET/HEAD，公开缓存一小时。
2. `/health`、`/api`、`/api/*`，以及五类原 `/bili/.../feed.xml` RSS 路由和 `/bili/files/*`、`/bili/img3/*` 图片代理，把原始 Request 交给 `serverApp.fetch`，保留 API 状态码、响应体、缓存头及错误。
3. 生产静态资源，根目录由启动器设置为 `dist/client` 的绝对路径。
4. TanStack Start 页面与内部请求。

`src/server/api.server.ts` 创建一个进程内 API 容器，供网关和 SSR 共用。开发环境也调用此容器，不需要另外启动 HTTP API 服务。其余 `/bili` 路径属于页面空间，旧 JSON 地址不重定向；Router 使用 `trailingSlash: 'preserve'`，避免 `/bili/` 因默认尾斜杠规范化而发生跳转。未知页面返回真实 404 和首页入口，不执行首页排行榜 loader。

`vite.config.ts` 将 `@lnovel/server` 保持为 SSR 外部依赖，并禁止客户端导入它或 `node:` 模块。浏览器产物不应包含数据库、抓取引擎或凭据配置。

## SSR、Query 与 Store

- `src/lib/top.ts` 定义共享 Query：key 为 `['top-weekvisit']`，`staleTime` 为 60 秒，接口为 `/api/bili/top/weekvisit`。
- SSR 通过 `src/lib/api.ts` 的服务端分支调用进程内 API；浏览器分支使用标准 `fetch`。
- `src/server/api-request.ts` 仅转发 cookie、authorization、转发主机与协议头，设置 JSON Accept，并合并文档请求与 Query 的取消信号；不转发文档缓存头和内容头。
- `getRouter()` 每次创建独立 QueryClient，经 SSR Query integration 完成脱水和恢复。
- 首页 SSR 预取失败后移除失败 Query，输出加载占位，由浏览器重试；HTTP 错误或无效业务响应由 `parseTopResponse` 转成错误状态。
- 排行榜数据由 Query 管理；`src/lib/home-store.ts` 只保存当前推荐项索引。页面实例之间不得共享 Store 或 QueryClient。

## SEO 与抓取声明

`src/lib/site.ts` 固定正式首页为 `https://lnovel.animes.garden/`。地址不随请求 Host、转发头、查询参数或 Server 的 `APP_HOST` 改变。迁移域名需要修改此配置并重新构建。

SEO description 逐字来自根 [`README.md`](../../README.md) 的项目介绍。名称和全局介绍文案变更遵守根 `AGENTS.md` 的审批规则，不能因本文件引用了实现就视为已批准新文案。

首页在服务端输出 description、canonical、Open Graph、Twitter summary 和 `WebSite` JSON-LD。404 使用独立标题和 `noindex`，不包含首页 canonical、分享信息或结构化数据。

sitemap 只列出正式首页，不包含 API、RSS、外站地址或未经验证的更新时间。robots 允许页面、稳定的 RSS 地址及静态资源抓取，仅声明禁止抓取 `/api` 命名空间、`/health` 和 Start 默认内部前缀 `/_serverFn`，同时显式放行封面所需的 `/bili/files/` 与 `/bili/img3/`。修改内部请求前缀时同步更新规则。

robots 只声明爬虫抓取偏好，不拦截请求，也不保证 URL 不被索引；当前没有限流、验证码、AI 爬虫专属规则或 Search Console 自动提交实现。

## 验证位置

`apps/web/test/` 分别验证网关转发、SSR 请求头、Query/Store 生命周期、真实 Server API 契约和生产构建产物。具体覆盖及隔离方式见 [测试说明](../testing.md)，启动与部署见 [开发](../development.md)、[部署](../deployment.md)。
