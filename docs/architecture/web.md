# Web 架构

代码位于 `apps/web`。主要入口为 [`src/server.ts`](../../apps/web/src/server.ts)、[`src/router.tsx`](../../apps/web/src/router.tsx)、[`src/routes/index.tsx`](../../apps/web/src/routes/index.tsx) 和 [`cli.mjs`](../../apps/web/cli.mjs)。

## 网关与服务端边界

`src/server/gateway.ts` 按顺序处理请求：

1. `/robots.txt` 和 `/sitemap.xml`，支持 GET/HEAD，公开缓存一小时。
2. `/health`、`/api`、`/api/*`，以及五类原 `/bili/.../feed.xml` RSS 路由和 `/bili/files/*`、`/bili/img3/*` 图片代理，把原始 Request 交给 `serverApp.fetch`，保留 API 状态码、响应体、缓存头及错误。
3. 生产静态资源，根目录由启动器设置为 `dist/client` 的绝对路径。
4. TanStack Start 页面与内部请求。

`src/server/api.server.ts` 创建一个进程内 API 容器，供网关和 SSR 共用。开发环境也调用此容器，不需要另外启动 HTTP API 服务。其余 `/bili` 路径属于页面空间，旧 JSON 地址不重定向；Router 使用 `trailingSlash: 'preserve'`，避免 `/bili/` 因默认尾斜杠规范化而发生跳转。Router 使用 `notFoundMode: 'root'`，未知页面（包括尚未实现的卷页和章节页）返回根 404 和首页入口，不执行首页或详情 loader。

`vite.config.ts` 将 `@lnovel/server` 保持为 SSR 外部依赖，并禁止客户端导入它或 `node:` 模块。浏览器产物不应包含数据库、抓取引擎或凭据配置。

## SSR、Query 与 Store

- `src/lib/top.ts` 定义共享 Query：key 为 `['top-weekvisit']`，`staleTime` 为 60 秒，接口为 `/api/bili/top/weekvisit`。
- SSR 通过 `src/lib/api.ts` 的服务端分支调用进程内 API；浏览器分支使用标准 `fetch`。
- `src/server/api-request.ts` 仅转发 cookie、authorization、转发主机与协议头，设置 JSON Accept，并合并文档请求与 Query 的取消信号；不转发文档缓存头和内容头。
- `getRouter()` 每次创建独立 QueryClient，经 SSR Query integration 完成脱水和恢复。
- 首页 SSR 预取失败后移除失败 Query，输出加载占位，由浏览器重试；HTTP 错误或无效业务响应由 `parseTopResponse` 转成错误状态。
- 排行榜数据由 Query 管理；`src/lib/home-store.ts` 只保存当前推荐项索引。页面实例之间不得共享 Store 或 QueryClient。

首页和详情页的加载占位共用 `src/components/ui/skeleton.tsx`，统一使用 muted 背景、圆角和脉冲动画；偏好减少动态效果时不播放动画。页面只指定尺寸，加载容器提供无障碍状态标签，不显示额外加载文案。

## 小说详情页

`/bili/novel/$nid` 提供小说详情和分卷列表。首页书名与封面使用站内 Link 同页进入详情，保留推荐项的悬停/聚焦切换。详情页点击页头 lnovel 返回首页，不显示独立的返回首页链接或面包屑；提供小说与分卷 RSS、原站链接；小说接口返回 `follow.feedId` 时显示 Folo，分卷不额外请求 Folo 映射。本站没有卷详情页、章节目录或正文阅读器。

- `src/lib/novel.ts` 定义 Web JSON 类型与 Query，key 为 `['bili-novel', nid]`，新鲜期 60 秒；只请求 `/api/bili/novel/:nid`，不逐卷加载，也不自动设置 `force`。
- 路由接受非负安全十进制整数 ID，前导零归一为数值 Query key。非法 ID 不调用 API，返回小说 404；API 404 缓存为 `null` 并转换为路由 not-found，不重试。
- loader 单次获取数据；非 404 的 HTTP、网络或业务响应异常会清除失败 Query，SSR 仅显示骨架屏，不显示加载文案，并通过无障碍标签标识加载状态。浏览器重新获取，失败后最多重试一次，仍失败则展示错误与手动重试按钮。浏览器恢复或刷新数据后通过缓存 loader 更新页面 head。
- 详情展示封面、作者角色、标签、上海时区更新日期、完整简介与按接口顺序排列的分卷。`author`、`illustrator`、`translator` 显示为作者、插画、译者，其他角色保留原文。`isDeleted` 显示下架提示并保留已有数据；`done` 不解释为作品完结。
- `src/lib/novel-description.ts` 使用 parse5 把简介 HTML 转为纯文本，保留段落与显式 `<br>` 换行并解码实体，折叠源码中的换行、缩进等 HTML 空白，避免 `<br>` 后的源码换行产生额外空行；忽略脚本、样式、模板和注释。SSR 与浏览器使用同一转换；解析器按需加载，不进入首页初始脚本。
- 首页的最新章节标签与详情页的作品标签共用 `NovelTag`，基于通用 `Badge` 的 secondary 样式，长文本允许换行。RSS/Folo 链接和小说、分卷共用的 `SourceButton`（前往原站）同样复用 `Badge` 的尺寸、字重和圆角，保留各自颜色与行为，操作入口统一图标在前、文本在后；页面不单独覆盖其尺寸。
- 封面、RSS/Folo 按钮及页脚供首页与详情页共用；封面缺失或加载失败时显示占位。缺少作者、简介或分卷分别显示空态；详情书名字号与首页轮播一致，统一使用 text-lg（18px），长标题自然换行。详情主封面与首页轮播使用相同的 3:4 比例、圆角及响应式尺寸：sm 起宽 220px，窄屏占满内容区并将信息与订阅按钮排列在封面下方。

## SEO 与抓取声明

`src/lib/site.ts` 固定正式首页为 `https://lnovel.animes.garden/`。地址不随请求 Host、转发头、查询参数或 Server 的 `APP_HOST` 改变。迁移域名需要修改此配置并重新构建。

首页 SEO description 逐字来自根 [`README.md`](../../README.md) 的项目介绍。名称和全局介绍文案变更遵守根 `AGENTS.md` 的审批规则，不能因本文件引用了实现就视为已批准新文案。

首页在服务端输出 description、canonical、Open Graph、Twitter summary 和 `WebSite` JSON-LD。小说详情页使用“书名 · lnovel”标题、作品简介纯文本 description 和正式域名下的小说 canonical（不含请求查询参数，ID 使用规范化数值）。正常详情允许索引，下架详情使用 `noindex`。加载或错误状态使用独立标题和 `noindex`，不输出 canonical。

404 使用独立标题和 `noindex`，不包含 canonical、分享信息或结构化数据。详情页不继承首页分享信息或 `WebSite` 结构化数据。

sitemap 只列出正式首页，不包含 API、RSS、外站地址或未经验证的更新时间。robots 允许页面、稳定的 RSS 地址及静态资源抓取，仅声明禁止抓取 `/api` 命名空间、`/health` 和 Start 默认内部前缀 `/_serverFn`，同时显式放行封面所需的 `/bili/files/` 与 `/bili/img3/`。修改内部请求前缀时同步更新规则。

robots 只声明爬虫抓取偏好，不拦截请求，也不保证 URL 不被索引；当前没有限流、验证码、AI 爬虫专属规则或 Search Console 自动提交实现。

## 验证位置

`apps/web/test/` 分别验证网关转发、SSR 请求头、Query/Store 生命周期、真实 Server API 契约和生产构建产物。具体覆盖及隔离方式见 [测试说明](../testing.md)，启动与部署见 [开发](../development.md)、[部署](../deployment.md)。
