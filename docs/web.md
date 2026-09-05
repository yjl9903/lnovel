# Web 实现与运行说明

lnovel 的统一入口：TanStack Start 页面、TanStack Query 服务端数据缓存、TanStack Store 页面交互状态，以及转发到 `@lnovel/server` 的 Hono 网关。

## 开发

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm web:dev
```

先构建 server 及业务包，再启动 web 的 Vite 开发服务（默认 3000）。`/bili/*` 始终访问本地内存 Hono app。修改 server 或业务包后，停止开发服务并重新运行 `pnpm web:dev`。

web 优先读取自身 `.env`，再读取仓库根目录 `.env`；生产环境已有变量优先。建议对 `DATABASE_FILE` 和 `CHROMIUM_USER_DIR` 使用绝对路径，以便在不同工作目录启动。

## 构建和运行

```sh
pnpm build
pnpm typecheck
pnpm test:ci
pnpm web:start
# 可选：pnpm web:start --host 127.0.0.1 --port 3001 --cron
```

生产启动器是 `apps/web/cli.mjs`，静态文件来自 `dist/client`，动态请求进入 `dist/server/server.js`。`HOST`/`PORT` 默认 `0.0.0.0:3000`。默认不启动 cron；`--cron` 每次启动进程只注册一次原有定时任务。API 仍可通过根目录的 `server:dev` / `server:start` 独立调试。

web 将 server 保留为外部 workspace 依赖；部署必须保留 server 的 `dist`、`drizzle` 目录及生产依赖。构建不执行数据库连接、迁移、抓取或定时任务。运行时仍由 server 按原规则连接 SQLite、执行迁移。

## 请求与状态

- `/health`、`/bili`、`/bili/*` 原样交给 `serverApp.fetch`，包括 API 错误响应。
- 页面和 Start 内部请求交给 Start；未知页面路径返回真实 404 和返回首页入口，不预取排行榜。
- SSR 和浏览器共用周榜 Query（`['top-weekvisit']`，60 秒 staleTime）。SSR 使用内存 fetch，浏览器请求原 `/bili/top/weekvisit`。
- SSR QueryClient 和页面 Store 均按实例创建，不能作为进程全局状态。推荐选中索引只存在 Store；排行榜数据只存在 Query。
- SSR 预取失败时输出加载占位，由浏览器重试并按原方式显示错误。

## SEO 与抓取规则

仅首页开放收录。`apps/web/src/lib/site.ts` 统一维护正式站点地址、名称和描述；描述逐字复用根 `README.md` 的项目介绍。迁移域名时修改站点地址并重新构建。SEO 地址固定为 `https://lnovel.animes.garden/`，不随请求 Host、转发头或查询参数改变，也不受 server 的 `APP_HOST` 影响。

首页通过路由 head 输出服务端可见的描述、canonical、Open Graph、Twitter summary 和 `WebSite` JSON-LD。404 页面有独立标题与 `noindex`，不带首页 canonical、分享信息或结构化数据。

网关在静态资源和 Start 之前处理 `/sitemap.xml` 与 `/robots.txt`，支持 GET/HEAD，公开缓存一小时。sitemap 只列出正式首页，不包含 API、RSS 或外站链接，也不生成未经验证的更新时间。

robots 允许首页和静态资源，禁止抓取 `/bili`、`/bili/` 下业务接口与 RSS、`/health`、Start 默认内部前缀 `/_serverFn`；单独放行 `/bili/files/` 和 `/bili/img3/`，供首页封面渲染。如果修改 Start 内部前缀，需要同步更新抓取规则。

robots 是爬虫自愿遵守的声明，不会拦截访问，也不保证被禁止抓取的 URL 不被索引。当前实现没有限流、验证码、AI 爬虫专属规则或自动提交 Search Console 的功能。

## Docker / Fly

从仓库根目录构建和部署：

```sh
docker build --platform linux/amd64 -f apps/web/Dockerfile -t lnovel-web .
# 验收本地镜像后再部署；保留先前镜像引用供回滚。
fly deploy --config apps/web/fly.toml
```

沿用 `lnovel-production`、`/health`、`/data` SQLite 卷及 Chromium 配置。启动命令改为 web，数据库 schema 不变；需要回滚时重新部署先前 server 镜像。
