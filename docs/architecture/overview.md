# 模块与数据流

本目录记录当前设计。修改模块职责、数据流或接口时，同步更新对应主题；开发过程见 [开发流程](../workflow.md)。

## Workspace 职责

| 目录 | 职责 | 当前边界 |
| --- | --- | --- |
| `apps/web` | 页面渲染、SSR 数据预取、状态与网关 | 服务端使用 `@lnovel/server`，浏览器访问同源 `/bili/*` |
| `apps/server` | Hono API、RSS、抓取调度、浏览器、SQLite、Folo 和 cron | 通过 `bilinovel` 解析页面；拥有抓取与持久化副作用 |
| `packages/bilinovel` | 小说、卷、章节、排行榜与分类页解析 | 调用注入的 HTML 获取函数，不启动浏览器、不连接数据库 |
| `packages/lnovel` | 库和 CLI 入口 | 当前库仅导出占位值，业务 CLI action 尚未实现 |
| `apps/flaresolverr` | 独立 Fly 配置 | 当前 Server 浏览器实现使用 CloakBrowser 和 Scrapeless，未接入此目录 |

运行主链路为 Web → Server → `bilinovel`。Server 的 manifest 还声明了 `lnovel` 依赖，但当前 HTTP 处理不经过其占位 CLI。包依赖声明不能代替能力证据。

## 请求与更新

1. Web 网关处理 `robots.txt`、`sitemap.xml`，将 `/health`、`/bili` 和 `/bili/*` 交给进程内 Hono app，其余请求先尝试静态资源，再进入 Start。
2. 首页 loader 通过该 Hono app 预取周点击榜，将 Query 缓存交给浏览器 hydration；浏览器后续请求使用同源 API。
3. API 按路由读取 SQLite 或执行抓取工作流。排行榜与分类页读取完成后会排队更新相关小说，小说相关请求也会触发后台更新。
4. 工作流使用浏览器会话取得 HTML，交给 `bilinovel` 解析，再由 Server 更新小说、卷、章节数据。
5. RSS 路由将业务数据转成 XML；开启 Folo 配置时查询和保存 feed ID 映射。

## 状态与生命周期

- Web 的 Hono API 容器在服务端进程内共享；QueryClient 每个 router 实例新建，页面 Store 每个页面实例新建。
- Server 的数据库连接、工作流 engine、缓存和本地浏览器状态属于进程级资源，不是跨进程共享调度器。
- 导入 Server 数据库模块会连接 SQLite 并运行迁移。Web 构建关闭预渲染并将 Server 作为外部依赖，避免在构建期执行这些运行时副作用。
- 只有启动参数包含 `--cron` 才注册定时任务；普通业务请求仍可能发起抓取和后台更新。
- SQLite 和浏览器 profile 需要持久化；Query/Store 和工作流内存状态不会随进程重启保留。

实现入口：[Web](web.md)、[Server](server.md)、[解析包与 CLI](packages.md)。运行与产物要求见 [开发](../development.md) 和 [部署](../deployment.md)。
