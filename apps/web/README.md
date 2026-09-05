# @lnovel/web

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
- 页面和 Start 内部请求交给 Start；非 API 历史页面路径继续显示首页。
- SSR 和浏览器共用周榜 Query（`['top-weekvisit']`，60 秒 staleTime）。SSR 使用内存 fetch，浏览器请求原 `/bili/top/weekvisit`。
- SSR QueryClient 和页面 Store 均按实例创建，不能作为进程全局状态。推荐选中索引只存在 Store；排行榜数据只存在 Query。
- SSR 预取失败时输出加载占位，由浏览器重试并按原方式显示错误。

## Docker / Fly

从仓库根目录构建和部署：

```sh
docker build --platform linux/amd64 -f apps/web/Dockerfile -t lnovel-web .
# 验收本地镜像后再部署；保留先前镜像引用供回滚。
fly deploy --config apps/web/fly.toml
```

沿用 `lnovel-production`、`/health`、`/data` SQLite 卷及 Chromium 配置。启动命令改为 web，数据库 schema 不变；需要回滚时重新部署先前 server 镜像。
