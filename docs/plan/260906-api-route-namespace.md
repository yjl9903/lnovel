# JSON API 命名空间迁移

## 背景与目标

释放 `/bili/...` 路径供 Web 页面使用；本次不新增页面。现有 JSON 接口统一迁移至 `/api/bili/...`，原五类 RSS 和 `/bili/files/*`、`/bili/img3/*` 图片代理保持稳定。

## 已确认决策

- 保留 bili 来源命名空间；旧 JSON 地址无别名和重定向。独立 Server 返回 404，Web 交给页面层，页面尚未实现时返回 HTML 404、noindex。
- `/health` 与非公开内部 cron 不变；不增加 `/api` 下的 RSS 或图片副本。
- 用户实施中补充确认：RSS 路径允许抓取。robots 仅限制 `/api`、健康检查和框架内部接口；sitemap 继续只列首页。
- JSON 参数、响应、缓存、超时、抓取、Folo 映射和图片 URL 生成行为保持不变。

## 技术方案

Server 使用两个 Hono 子应用，分别挂载 `/api/bili/` 和 `/bili/`，共同初始化业务中间件；请求日志仍由外层 app 负责。Web 网关转发 API 命名空间、健康检查，以及显式列出的五类 RSS 和两类图片代理，其他请求经过静态资源处理进入 Start。SSR 与浏览器共享 Query 切换至新地址。Router 保留尾斜杠，避免旧 `/bili/` 地址发生框架默认的规范化重定向。共享中间件的 Folo 延迟更新仅适用于 `/bili/` 下的 RSS 地址。

保留现有 request ID 关联、runTask/scheduleTask、静态资源日志策略。同步架构、开发、部署、测试、日志说明及 HTTP 示例，不修改 README、全局介绍文案、数据库或解析包行为。

## 验收与发布

使用真实路由、中间件和 RSS 序列化搭配离线 I/O 替身验证所有路由、force/筛选、RSS 条目与链接、图片映射、错误及超时。真实 Server 测试使用临时 SQLite；生产产物测试验证 SSR、静态资源、页面 404、SEO 与请求日志关联。

使用 pnpm 12.3.4 执行 `pnpm build`、`pnpm typecheck`、`pnpm test:ci`。Web 与 Server 同步发布；外部 JSON 调用方切换新地址，RSS 订阅及图片无需修改。

## 完成状态

实现、测试与文档已完成。Node.js v24.15.0、pnpm 12.3.4 下，`pnpm build`（4 项任务）、`pnpm typecheck`（7 项任务）及 `pnpm test:ci`（12 项任务，119 个测试）全部通过；任务包含有效的 Turbo 缓存命中。生产产物覆盖旧 JSON 地址含尾斜杠时无重定向的 HTML 404、首页 SSR 和资源链接；离线路由测试覆盖 RSS/图片与 Folo 地址隔离。文档链接和 `git diff --check` 通过。

未执行真实外站抓取或线上部署；未修改 README、数据库、解析包及生成文件。
