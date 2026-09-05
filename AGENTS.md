# 项目协作规则

## 文档优先的开发流程

- 从 [文档索引](docs/index.md) 开始，行为变更前先阅读相关 `docs/architecture/`、实现和测试，确认当前约定；发现不一致时先明确并修正偏差。
- `docs/architecture/` 是当前设计的基准，描述现行模块职责、接口、数据流与约束；不要把待实现方案写成已有能力。
- 综合评估改动量和影响范围，只有较大需求才创建 `docs/plan/<YYMMDD>-<requirement-name>.md`，记录背景、目标、关键决策、技术方案和验收方式。小范围修改不强制写计划；同一上下文优先复用已有计划。
- 实现过程中同步更新受影响的架构、运行说明和测试。代码、测试与架构文档不一致时，任务尚未完成。历史背景放在计划或版本记录中，不能代替现状文档。
- 具体步骤和文档分工见 [开发流程](docs/workflow.md)。

## 项目结构与实现边界

- `apps/web`：TanStack Start 页面、SSR、Query/Store 状态和 HTTP 网关。
- `apps/server`：Hono API、RSS、抓取工作流、浏览器会话、SQLite 和定时任务。
- `packages/bilinovel`：接受注入的 HTML 获取函数并解析页面，不承担浏览器生命周期或数据库写入。
- `packages/lnovel`：库与 CLI 入口；当前业务命令仍是占位，不能按依赖或命令名称推断已实现能力。
- 源码、测试分别位于各 workspace 的 `src/`、`test/`。不要手改 `dist/`、`apps/web/src/routeTree.gen.ts` 等生成文件。
- 保持 Web 到 Server、业务层到解析包的依赖方向。SQLite、浏览器和抓取凭据只能进入服务端代码；SSR QueryClient 与页面 Store 按实例创建。
- 优先采用满足当前需求的直接实现，避免推测性的抽象和扩展。涉及既有 API、RSS 链接或数据库语义时，先确认兼容性要求；用户已明确的要求无需重复询问。

## 开发与验证

- 使用 `package.json` 声明的 Node.js 范围和固定 pnpm 版本；本地、CI、镜像的具体版本见 [开发说明](docs/development.md)。
- 根目录常用命令：`pnpm install --frozen-lockfile`、`pnpm web:dev`、`pnpm build`、`pnpm typecheck`、`pnpm test:ci`。
- `pnpm web:dev` 先构建依赖，再启动页面开发服务；修改 Server 或业务包后重新运行。生产入口为 `pnpm web:start`。
- 遵循仓库 TypeScript strict、ESM 和 Prettier 配置：两空格缩进、分号、单引号、100 列、不保留尾逗号。
- 按 [测试说明](docs/testing.md) 选择验证范围。测试使用本地 HTML、临时数据库和可控请求替身，不依赖在线抓取或真实凭据；涉及生产 SSR 的变更需要验证构建产物。
- 纯文档修改核对源码、命令与链接即可；功能变更运行相关测试，跨包或构建变更执行完整构建、类型检查和测试。交付时说明实际执行结果及未验证部分。
- 提交使用 Conventional Commits；PR 说明行为变化、文档变化和验证结果。
- 不提交 `.env`、token、数据库、浏览器 profile、抓取截图或构建产物。开发运行和迁移使用独立数据路径。

## 全局介绍文案与 README 审批

- 项目名称、简介、SEO description、分享摘要等全局介绍文案，优先逐字复用用户编写或已确认的 `package.json`、`README.md` 中的现有内容，并注明来源。不要自行扩写、润色或补充产品定位与能力描述。
- 如确实需要新增或改写全局介绍文案，先向用户展示具体文案、使用位置及理由，获得明确批准后再写入文件。不要将代理此前自行生成的文案视为已获用户认可的来源。
- 新增、修改、删除或移动任何 `README.md` 前，先展示具体草案或变更内容，获得用户明确批准后再执行。一般功能开发请求不自动授权修改 README。
- 用户已经明确授权的具体文案或 README 修改无需重复审批；授权只适用于已确认的范围。

## 实现文档

- 架构、实现细节、开发运行、部署、测试和排查说明统一放在仓库根目录的 `docs/` 下；目录与维护责任见 `docs/index.md`，不要自动追加到 README。
- `docs/` 中的技术说明应以代码和验证结果为依据；若涉及全局介绍文案，仍遵守上述审批规则。
