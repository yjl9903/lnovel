# Server 架构

Server 位于 `apps/server`。[`src/app.ts`](../../apps/server/src/app.ts) 导出 `createApp` 和 `startCron`；[`src/index.ts`](../../apps/server/src/index.ts) 提供独立 HTTP 启动函数。Web 使用同一 app 工厂进行内存调用。

## HTTP 与 RSS

路由集中在 [`src/bilinovel/index.ts`](../../apps/server/src/bilinovel/index.ts)，统一挂载于 `/bili/`。

| 路由 | 行为 |
| --- | --- |
| `/health` | 返回服务健康响应，不发起抓取 |
| `/bili/` | 返回 provider 信息 |
| `/bili/contexts` | 当前进程的工作流状态与进度 |
| `/bili/wenku`、`/bili/top/:sort` | 分类筛选结果与排行榜 |
| `/bili/novels` | 数据库中的小说列表 |
| `/bili/novel/:nid` | 小说信息 |
| `/bili/novel/:nid/vol/:vid` | 卷信息 |
| `/bili/novel/:nid/chapter/:cid` | 章节内容 |
| `/bili/novels/feed.xml`、`/bili/wenku/feed.xml`、`/bili/top/:sort/feed.xml` | 列表 RSS |
| `/bili/novel/:nid/feed.xml`、`/bili/novel/:nid/vol/:vid/feed.xml` | 小说与卷 RSS |
| `/bili/files/*`、`/bili/img3/*` | 图片代理 |

小说、卷、章节 ID 由路由参数校验器检查；筛选规则来自 `bilinovel` 的 `parseTopFilter` 与 `parseWenkuFilter`。相关 JSON 路由优先读取数据库，`force` 查询值非空时跳过该次数据库直返，但不代表清空工作流缓存。

全局中间件记录请求并添加 `X-Request-Id`、`X-Response-Timestamp`。业务路由使用 ETag；没有既有缓存头的 200 响应默认公开缓存一天，`/contexts` 禁用缓存。业务请求超时设为 30 秒，JSON 与 RSS 的超时/错误响应形式不同，网关不将它们统一改写。

`src/rss/feed.ts` 使用 `feed` 生成 RSS 2.0 XML。链接基于请求与转发头计算的 origin，区别于 Web SEO 的固定正式地址。`src/folo.ts` 在配置 `FOLLOW_USER_ID` 时启用 feed ID 查询与保存；外部查询失败可返回缺失映射。

## 抓取与更新

[`src/bilinovel/workflow.ts`](../../apps/server/src/bilinovel/workflow.ts) 使用 flomise engine 编排读取和写入：

- `getNovel`、`getNovelVolume`、`getNovelChapter` 获取并解析页面，使用按业务 ID 标识的缓存。
- `getTop`、`getWenku` 共用并发为 1 的队列，结果缓存一小时，读取后延迟排队更新相关小说。
- `updateNovel`、`updateNovelVolume`、`updateNovelChapter` 负责持久化和子任务调度；小说路由返回结果后也会触发后台更新。
- 小说更新以 `done` 和 `fetchedAt` 决定是否跳过近期数据；这里的 `done` 表示抓取处理完成，不能直接解释成作品已完结。
- 识别小说下架后标记 `isDeleted=true`、`done=true`，保留既有小说、卷和章节数据。

请求响应、工作流缓存和后台更新有不同生命周期。HTTP 超时不等价于所有后台任务已取消，`/health` 成功也不代表外站抓取可用。

## 浏览器会话

[`src/bilinovel/browser.ts`](../../apps/server/src/bilinovel/browser.ts) 管理实际网络访问。优先复用本地 CloakBrowser persistent context；创建或抓取失败后，会话转用 Scrapeless 远端浏览器，需要 `SCRAPELESS_TOKEN`。

本地浏览器默认无头，使用 `CHROMIUM_USER_DIR` 保存 profile，运行 12 小时后在下次取用时重建。导航通过进程内锁控制间隔，默认基础间隔 15 秒并增加随机等待；识别限流后延长等待。失败会保存 `.screenshot/` 截图并按重试策略处理；重复失败 URL 和远端余额不足各有冷却缓存。

会话的 `close()` 关闭远端资源，本地 persistent context 由进程级逻辑复用。此机制不提供跨进程的全局限流或任务排重。

## SQLite 与迁移

[`src/database.ts`](../../apps/server/src/database.ts) 通过 `drizzle-sqlite` 连接 `DATABASE_FILE`，未设置时使用工作目录下的 `lnovel.db`。模块在导入时立即连接并执行 `apps/server/drizzle/` 中的迁移，必须先加载环境变量。

表定义位于 `src/schema/`：`bili_novels`、`bili_volumes`、`bili_chapters` 保存小说层级与抓取状态，`folos` 保存 feed URL 与 ID 映射。读取与部分写入在 `bilinovel/database.ts`，抓取编排中的写入也存在于 `bilinovel/workflow.ts`；当前尚未统一为独立 repository 层。

修改 schema 时同步审阅迁移、数据读写和既有数据库兼容性。测试使用临时数据库，不应导入模块后再设置路径。部署需要保留 `dist`、`drizzle` 和生产依赖。

## 定时任务

`startCron()` 创建专用内存 Hono app，在 `Asia/Shanghai` 时区每小时整点处理未完成小说，并在注册 60 秒后主动触发一次。内部路径 `/bili/_/cron` 不挂载到公开 app；`APP_HOST` 用于构造该内存请求的 origin。

Web 和 Server 启动器仅在传入 `--cron` 时调用它；默认 Docker 与 Fly 启动命令均未启用。启动器一次启动调用一次，但 `startCron` 本身没有重复注册保护，多次调用或多进程开启都会创建额外任务。

配置与排查见 [开发](../development.md)、[部署](../deployment.md)；离线验证边界见 [测试](../testing.md)。
