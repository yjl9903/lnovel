# 部署与排查

当前部署入口为 `apps/web/cli.mjs`，同时服务页面和进程内 API。本文描述仓库配置，不代表已执行部署或验证线上可用性。

## 产物与运行条件

从根目录执行 `pnpm build` 后，Web 静态文件位于 `apps/web/dist/client/`，动态请求进入 `apps/web/dist/server/server.js`。启动器以自身位置解析静态路径，不依赖 shell 当前目录。

Web 将 `@lnovel/server` 保留为外部 workspace 依赖。部署需要 workspace 生产依赖、Server 的 `dist/` 和 `drizzle/` 以及业务包产物，不能只复制 Web 的 `dist/`。

构建关闭预渲染，不运行数据库迁移、抓取和 cron。运行时导入 Server 会连接 SQLite 并迁移；确保数据库父目录可写且使用独立或已备份的数据文件。

## Docker 与 Fly

在仓库根目录构建：

```sh
docker build --platform linux/amd64 -f apps/web/Dockerfile -t lnovel-web .
```

Docker 按阶段设置环境：公共 `base` 阶段不设置 `NODE_ENV`；`build` 阶段设置 `CI=true`，从根 `package.json#packageManager` 安装 pnpm，并用 `pnpm install --frozen-lockfile` 安装完整依赖。仅构建命令使用 `NODE_ENV=production pnpm run build`，随后通过 `pnpm prune --prod` 明确裁剪开发依赖。最终运行阶段统一设置 `NODE_ENV=production`，不继承 `build` 阶段的 `CI`。

镜像安装 Chromium 系统依赖并下载 CloakBrowser 二进制。默认配置：

| 项目 | 当前值 |
| --- | --- |
| 启动命令 | `node apps/web/cli.mjs start` |
| HTTP 端口 | `3000` |
| 数据库 | `/data/sqlite.db` |
| 浏览器 profile | `/data/profile` |
| 浏览器二进制缓存 | `/cloakbrowser` |
| cron | 未启用 |

可用本地专用卷启动镜像验收：

```sh
docker run --rm -p 127.0.0.1:3000:3000 -v lnovel-dev-data:/data lnovel-web
```

验收镜像并保留先前镜像引用后，从根目录部署：

```sh
fly deploy --config apps/web/fly.toml
```

当前 Fly 配置使用 `lnovel-production`、`lax` 区域、名为 `server` 的进程、`/health` 检查和挂载至 `/data` 的 `sqlite` 卷。启动命令没有 `--cron`；需要定时任务时显式调整启动参数，并只在预期实例开启，进程内调度不提供跨实例排重。

`apps/flaresolverr/fly.toml` 是独立配置，不是当前 Web 发布入口。

## 验收与回滚

构建和离线验证命令见 [测试说明](testing.md)。运行验收至少区分以下层次：

- 服务存活：`GET /health`；它不验证抓取或数据库中业务数据是否完整。
- Web 路由：首页 HTML、静态资源、`/robots.txt`、`/sitemap.xml`、未知页面的真实 404。
- API 契约：`/api/bili/`、`/api/bili/contexts`、非法 ID 的错误响应、ETag 条件请求。
- 实际业务：在独立数据环境中检查排行榜、小说、RSS 和图片；这些请求可能访问外站并更新数据库。

发布前保存可回滚的镜像引用，并按现有运维方式备份持久化数据。回滚重新部署已知可用镜像；镜像回退不会撤销数据库迁移。若本次涉及 schema 变化，必须确认旧镜像能读取迁移后的数据，或制定相应数据恢复方案。

## 常见问题

| 现象 | 检查位置与处理 |
| --- | --- |
| 修改 Server 后页面仍表现为旧逻辑 | Web dev 使用已构建依赖；停止并重新运行 `pnpm web:dev` |
| 启动出现数据库或迁移错误 | 检查 `DATABASE_FILE` 的绝对路径、目录权限、`apps/server/drizzle/` 是否随产物部署 |
| 本地浏览器无法启动 | 检查浏览器准备命令、系统依赖、profile 目录；相关日志来自 `browser.ts` |
| 本地失败后远端连接失败 | 检查 `SCRAPELESS_TOKEN` 与远端余额；余额不足会触发冷却 |
| 请求超时、首页只有加载占位 | 检查 Server 请求 ID、工作流 `/api/bili/contexts` 和浏览器日志；SSR 预取失败会交给客户端重试 |
| `/health` 正常但业务失败 | 健康检查不抓取外站，需单独核对抓取、数据和代理图片链路 |
| 静态资源缺失 | 使用正式启动器并确认 `dist/client` 完整，避免遗漏 workspace 产物 |
| SEO 仍指向原域名 | 修改 `apps/web/src/lib/site.ts` 后重新构建；`APP_HOST` 不控制 SEO |
| 没有定时更新 | 检查启动命令是否包含 `--cron`；默认 Docker/Fly 未启用 |

浏览器 profile、SQLite、`.env`、失败截图可能包含本地或会话数据，不加入版本控制。

## JSON API 路径迁移

JSON 接口由 `/bili/...` 改为 `/api/bili/...`，Web 与 Server 必须同步构建发布。外部 JSON 调用方需切换地址；旧地址没有兼容别名或重定向，在 Web 中由页面层处理，页面尚未实现时返回 HTML 404。五类原 RSS 订阅和 `/bili/files/*`、`/bili/img3/*` 图片地址保持不变；robots 允许 RSS 抓取。
