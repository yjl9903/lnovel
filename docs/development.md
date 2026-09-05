# 开发与配置

本文命令除另有说明外，均在仓库根目录执行。

## 环境与安装

根 `package.json` 要求 Node.js `>=24`，固定包管理器为 `pnpm@11.25.0`。当前版本配置并未统一：`.node-version` 为 `v26.1.0`，CI 使用 `26.7.0`，Docker 基础镜像为 `platformatic/node-caged:26.3.1-slim`。复现问题时应注明实际运行版本；本文不修改这些配置。

```sh
pnpm install --frozen-lockfile
```

首次需要本地抓取时准备浏览器二进制：

```sh
pnpm --filter @lnovel/server browser:prepare
```

此命令下载 CloakBrowser，不是普通离线测试的前置条件。Linux 运行所需系统依赖可对照 `apps/web/Dockerfile`。

## 本地启动

```sh
pnpm web:dev
```

`pnpm dev` 等价于上述入口。脚本先构建 Web 的 workspace 依赖，再启动 Vite，开发服务默认监听 `0.0.0.0:3000`。页面与 `/bili/*` 共用进程内 Server，首页预取可能触发真实抓取。修改 Server 或业务包后停止并重新运行该命令，使依赖产物更新。

只调试 API 时先构建依赖，再启动源码入口：

```sh
pnpm build
pnpm server:dev --host 127.0.0.1 --port 3001
```

构建后运行生产入口：

```sh
pnpm build
pnpm web:start --host 127.0.0.1 --port 3000
# 独立 API 入口
pnpm server:start --host 127.0.0.1 --port 3001
```

生产启动参数优先于 `HOST`、`PORT`，默认值为 `0.0.0.0:3000`。需要定时更新时在相应启动命令追加 `--cron`；默认不注册定时任务。

## 环境变量

Web 开发配置和生产启动器依次读取 `apps/web/.env`、根 `.env`，已有进程环境变量优先。独立 Server 使用 `dotenv/config`，默认从启动工作目录读取 `.env`。数据库导入即连接并迁移，因此配置必须在导入之前生效。

本地 `.env` 最小示例（路径替换为自己的绝对路径，父目录需已存在）：

```dotenv
HOST=127.0.0.1
PORT=3000
DATABASE_FILE=/absolute/path/to/lnovel-dev.db
CHROMIUM_USER_DIR=/absolute/path/to/lnovel-profile
```

| 变量 | 默认或未设置时行为 | 用途 |
| --- | --- | --- |
| `HOST`、`PORT` | 生产启动为 `0.0.0.0:3000` | HTTP 监听；Web dev 的默认地址由脚本固定 |
| `DATABASE_FILE` | 工作目录下 `lnovel.db` | SQLite 数据文件 |
| `CHROMIUM_USER_DIR` | 工作目录下 `.profile` | 本地浏览器 profile |
| `CLOAKBROWSER_HEADLESS` | 无头；设为字符串 `false` 时有头 | 本地浏览器调试 |
| `CLOAKBROWSER_CACHE_DIR` | 交由 CloakBrowser 管理；镜像设为 `/cloakbrowser` | 浏览器二进制缓存 |
| `SCRAPELESS_TOKEN` | 无 token 时远端连接失败 | 本地失败后的远端浏览器回退 |
| `APP_HOST` | `lnovel.animes.garden` | cron 内部请求的主机名，不含协议；不控制 Web SEO |
| `FOLLOW_USER_ID` | 跳过 Folo feed ID 查询与保存 | Folo 映射和 RSS challenge |

`WEB_ASSET_ROOT` 由 Web 启动器设置为构建产物路径，不需手动配置。Server CLI 中的 `--secret`、`--redis-uri` 只有参数声明，当前没有对应鉴权或 Redis 实现，不应作为已生效配置使用。

## 常用检查

```sh
pnpm build
pnpm typecheck
pnpm test:ci
```

根 `turbo.json` 中，构建依赖上游构建，类型检查依赖上游构建，`test:ci` 依赖本 workspace 的构建和类型检查。包级测试命令不会自动补齐根流水线的所有前置步骤，详见 [测试说明](testing.md)。

`pnpm format` 只格式化 JS/TS 源码，不包含 Markdown。修改文档后核对相对链接、命令与代码事实。

数据库 schema 与迁移位于 `apps/server/src/schema/`、`apps/server/drizzle/`。schema 修改后可用 `pnpm --filter @lnovel/server drizzle:generate` 生成候选迁移，再审阅 SQL 和临时数据库验证；服务启动会应用迁移，运行前先确认数据路径。
