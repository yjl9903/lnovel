# 开发文档索引

行为变更前先读相关架构，再核对实现与测试；完成变更时同步维护这些文档。协作规则见 [AGENTS.md](../AGENTS.md)，具体步骤见 [开发流程](workflow.md)。

## 当前架构

| 文档 | 内容 | 主要代码位置 |
| --- | --- | --- |
| [模块与数据流](architecture/overview.md) | workspace 职责、依赖方向、状态边界 | `apps/`、`packages/` |
| [Web](architecture/web.md) | 网关、SSR、Query/Store、SEO | `apps/web/src/` |
| [Server](architecture/server.md) | API、RSS、工作流、浏览器、数据库与 cron | `apps/server/src/` |
| [解析包与 CLI](architecture/packages.md) | HTML 解析契约和当前入口限制 | `packages/` |

## 开发和运维

- [开发流程](workflow.md)：文档优先、计划使用时机、交付要求。
- [开发与配置](development.md)：运行环境、启动命令、环境变量。
- [测试](testing.md)：现有覆盖、隔离方式、验证命令。
- [部署与排查](deployment.md)：构建产物、Docker/Fly、持久化、验收和排查。
- [HTTP 请求示例](../examples/api.http)：按现有路由维护的请求样例。
- [Web 文档入口](web.md)：原 `docs/web.md` 链接的导航页。

## 文档分工

- `docs/architecture/` 只记录当前有效设计；行为、接口或职责改变时同步更新对应主题。
- `docs/plan/` 按需创建，文件命名为 `<YYMMDD>-<requirement-name>.md`；记录较大需求的设计过程和验收，不作为现状文档的替代品。
- 根目录 README 保留项目介绍与使用入口；workspace README 提供各自入口。任何 README 变更和全局介绍文案改写仍按 `AGENTS.md` 先展示具体内容并取得批准。
- 技术说明以源码、配置和实际验证为依据。命令写明工作目录和前置条件；未执行的检查不能写成已通过。

本轮整理依据仓库源码和配置，不代表线上服务、外站抓取或部署环境已经通过验收。
