# 测试与验证

当前测试分布在各 workspace 的 `test/`，使用 Vitest。测试应验证可观察行为，使用确定的输入和独立临时资源，不依赖真实抓取、远端浏览器 token 或生产数据库。

## 现有覆盖

| 测试文件 | 验证内容 | 隔离边界 |
| --- | --- | --- |
| `packages/bilinovel/test/novel.test.ts` | 小说、卷、分页章节、图片转换和下架识别 | 从 `__assets__/` 读取 HTML，使用快照 |
| `apps/server/test/bilinovel.routes.test.ts` | JSON 命名空间迁移、原 RSS/图片契约、筛选与 force、错误及超时 | 真实路由/中间件与 RSS 序列化，替换数据库/工作流/网络/Folo 边界 |
| `apps/server/test/bilinovel.database.test.ts` | 下架标记后保留已有小说与卷数据 | 临时 SQLite，运行真实迁移 |
| `apps/web/test/gateway.test.ts` | JSON 与保留资源分流、旧 JSON 路径交给页面、方法/请求体/取消、允许 RSS 抓取的 SEO 文件、SSR 请求头 | 注入 fetch handler |
| `apps/web/test/top.test.ts` | Query hydration、SSR 失败重试、实例隔离和响应解析 | mock API 获取边界 |
| `apps/web/test/novel.test.ts` | 详情 Query 恢复与隔离、ID/响应校验、404 不重试、简介纯文本转换、日期和 SEO | mock API 获取边界 |
| `apps/web/test/server.test.ts` | 经网关访问真实 Server 的状态、正文、ETag、缓存语义与新 API 请求日志关联 | 临时 SQLite，仅调用不触发抓取的路由 |
| `apps/web/test/production.test.ts` | 客户端依赖隔离、生产首页/详情 SSR、站内入口、静态资源、SEO、404、下架/空态与并发请求 | 子进程运行构建产物，loader 用固定 API 替身替换 Server |
| `packages/lnovel/test/index.test.ts` | 占位断言 | 不验证 CLI 业务 |

详情生产 fixture 包含成功、缺失、下架、空数据、错误、超时和无效响应；未知卷页/章节页同时断言不请求小说 API。浏览器验收应检查 375px 手机和桌面布局、长标题、封面失败、首页跳转、前进后退、恢复后的 SEO，以及 SSR 恢复后不立即重复请求。

生产构建测试验证 Web 产物与 API 边界组合，不等价于完整在线抓取测试。当前没有覆盖浏览器回退、真实外站可用性或完整工作流更新链路的端到端测试；不要将已有测试通过表述为这些能力已验收。

## 验证命令

跨包、构建或服务边界变更，在根目录执行：

```sh
pnpm build
pnpm typecheck
pnpm test:ci
```

CI 当前显式执行安装、构建和 `test:ci`；类型检查由 Turbo 的测试依赖触发。完整检查成功后，无新改动或未解决疑点时无需重复运行。

已有最新构建产物时，可按改动范围执行：

```sh
pnpm --filter bilinovel test:ci
pnpm --filter @lnovel/server test:ci
pnpm --filter @lnovel/web test:ci
```

Web 生产测试要求 `apps/web/dist/` 存在且对应当前代码；Web 的真实 Server 测试也通过包入口加载 Server 构建产物。首次安装或修改其依赖后先运行根构建。

## 新增和维护测试

- 解析修改使用可复用 HTML fixture，断言公开结果与有意义的失败场景；快照更新需逐项审阅。
- 数据库测试先设置临时 `DATABASE_FILE`，再动态导入数据库模块；结束后清理临时资源。
- 网关和页面状态测试使用可控请求边界，保留被测模块的真实行为。需要验证真实 API 契约时沿用 `server.test.ts` 的装配方式。
- SSR 和浏览器依赖边界变化需要覆盖生产产物，不能只验证源码函数。
- 新增抓取、缓存或重试测试应替换外部网络与时钟边界，验证结果和副作用，不依赖真实站点或长时间等待。
- 不为了凑覆盖率给空实现添加机械断言，也不为纯文档改动新增业务测试。

纯文档修改检查链接、路径、脚本名称与实现事实；交付说明列出实际检查和未执行的运行验收。手工请求真实业务接口会触发抓取，不能混同于离线检查。
