# 服务端结构化日志

## 数据流与运行边界

服务端业务通过 `@lnovel/server/logging` 的 `createLogger(scope)` 写入 OpenTelemetry Logs SDK。`LoggerProvider` 使用 `SimpleLogRecordProcessor`，由自定义 `JsonLogRecordExporter` 将每条记录写为一行 JSON，Fly 收集 stdout 后提供实时日志及历史查询。

这是 OTel LogRecord 的 JSON 映射，**不是 OTLP/JSON 协议报文**。本实现不创建 span、不发送 OTLP、不部署 Collector，也不改变 Fly 的保留时间。它只替换项目服务端自己的 console/consola 调用；第三方库、Node 警告、构建工具和独立下载 CLI 仍可能输出普通文本。

日志子入口不导入业务入口、数据库或浏览器模块。创建 logger 不初始化 SDK；启动器在加载业务模块前初始化，Web 开发运行入口也执行同样的初始化。运行时与 AsyncLocalStorage 在同一进程内共享，重复初始化和热更新不会重复添加 exporter。`createLogging` 可创建隔离实例，用于测试或单独管理生命周期。

## 使用与配置

```ts
import { createLogger } from '@lnovel/server/logging';

const logger = createLogger('bilinovel');
logger.info('Novel updated', {
  event: 'novel.updated',
  novel_id: 123,
  duration_ms: 420
});
logger.error('Novel update failed', { event: 'novel.update.failed', novel_id: 123 }, error);
```

所有方法为 `debug/info/warn/error(message, attributes?, error?)`。依赖注入给 `bilinovel` 的 console 风格接口使用局部 `consoleLogger(logger)` 适配器，不覆盖全局 console。

| 配置 | 行为 |
| --- | --- |
| `LOG_LEVEL` | `debug`、`info`、`warn`、`error`，默认 `info`；未知值回退到 `info` |
| `OTEL_SERVICE_NAME` | 覆盖服务名；Web 默认为 `lnovel-web`，独立 API 默认为 `lnovel-server` |
| `NODE_ENV` | 写入 `deployment.environment.name`，未设置时为 `development` |
| `FLY_MACHINE_ID` | 存在时写入 `service.instance.id` |
| `FLY_REGION` | 存在时写入 `cloud.region` |

服务版本取自 server 的 package.json。`OTEL_LOG_LEVEL` 不是业务日志等级开关。本出口不读取 OTLP 地址或认证配置。开发与生产都使用 JSON。

## 字段与关联

一条日志形如以下内容；实际输出不缩进，异常堆栈中的换行也经过 JSON 转义：

```json
{"timestamp":"2026-09-06T08:30:00.000Z","severity_text":"INFO","severity_number":9,"body":"Request completed","scope":"web","resource":{"service.name":"lnovel-web","service.version":"0.0.4","deployment.environment.name":"production"},"attributes":{"event":"http.request.completed","request_id":"generated-uuid","method":"GET","pathname":"/api/bili/novel/123","status":200,"duration_ms":420}}
```

`resource` 还包含 SDK 默认资源属性。`attributes` 是业务字段容器：

- 请求：`request_id`、`method`、`pathname`、`status`、`duration_ms`。
- 任务：`task_id`、`parent_task_id`、`trigger_request_id`、`task_name`；workflow 执行还包含 `workflow`、`workflow_key`。
- 抓取：`novel_id`、`volume_id`、`chapter_id`、`upstream_url`、`attempt`、`max_attempts`、`wait_ms` 等。
- 异常：`exception.type`、`exception.message`、`exception.stacktrace`。非 Error 抛出值仍有类型和消息。

Web 网关每个外部请求生成一个 ID；独立 API 入口在没有已有上下文时生成 ID。内部 API 调用复用上下文。客户端的 `X-Request-Id` 不被采信；API 响应头保留服务端生成的 `X-Request-Id`。

每个外部请求只记录一次 `http.request.completed`，内存转发/SSR 内部 API 使用 `api.call.completed`。耗时截至处理器产出 Response，不包括流式响应完全发送所需时间。成功健康检查和静态资源事件为 debug，普通成功请求为 info，4xx 为 warn，5xx 为 error。异常详情与请求完成是不同事件，按请求完成事件统计请求量，避免重复计算。

抓取在实际 workflow action 执行时生成任务 ID，嵌套任务以 `parent_task_id` 关联。队列在入队时捕获上下文，防止执行时继承前一个任务的上下文。共享执行只产生一个实际执行任务；各调用者通过 `workflow.requested` 的 workflow/key 记录请求关联。缓存命中不产生虚构的执行任务。任务使用 `trigger_request_id` 标识触发来源，不把共享任务假设为所有等待请求各自执行一次。

业务直接使用 flomise 的 `workflow`、`newQueue`、`engine.run()` 和 `ctx.run()`。调用分支直接写入 `workflow.requested`，后台调用在创建独立任务上下文前记录，保留调用者的请求关联；action 内使用 `runTask` 管理实际任务生命周期，没有 workflow 日志适配层。

### flomise 依赖补丁

当前 `flomise@0.0.6` 在前一个任务完成后直接启动下一个排队回调，可能让后一个任务继承前一个任务的 AsyncLocalStorage 上下文。`patches/flomise@0.0.6.patch` 使用 Node 的 `AsyncResource.bind` 在提交时绑定上下文：

- `newQueue.add()` 保证公开队列 API 的上下文隔离，包括 `all()`。
- `Context.exec()` 在向队列提交每次执行时绑定完整回调，覆盖自定义 Queue、执行钩子和重试。

补丁仅修改 flomise 的异步执行机制，不依赖日志模块或 OTel，也不改变缓存 key、并发度与去重规则。依赖版本和补丁哈希由 pnpm 锁定；Docker 在安装依赖前复制 `patches/`。升级 flomise 时应确认上游是否已修复这两个边界，运行 `flomise-context.test.ts` 和 `logging-workflow.test.ts` 后移除或更新补丁。当前没有向上游发布新版本。

脱离请求运行的更新、定时任务和延迟任务拥有独立任务上下文。`task.started`、`task.completed`、`task.failed` 带任务名，完成与失败事件还带耗时。

URL 日志只保留协议、主机、路径；不记录凭据、查询参数或 fragment。调用点不传入请求头或请求体；序列化对敏感属性做额外遮蔽，也清理异常消息中的 URL。bigint 转字符串，循环引用标记为 `[Circular]`。不要向日志传递整段抓取内容或不必要的大对象。

## Fly 查询

在 Fly Dashboard 使用 Live Logs 查看实时输出，历史查询进入 Search logs in Grafana。Fly 官方当前说明为 VictoriaLogs + LogsQL、保留 7 天；实际保留策略以平台为准：[Fly Search logs](https://fly.io/docs/monitoring/search-logs/)。

**上线后先展开一条真实日志，确定原始 JSON 字符串所在字段。** 以下示例假设它在 `_msg` 中，且已在面板限定应用和时间范围；若实际在 `message` 等字段中，将 `from _msg` 替换为实际字段。`unpack_json` 会展开嵌套字段；这些是查询时解析，不假设 Fly 自动索引业务 JSON 属性。

按请求筛选：

```text
_time:1h
  | unpack_json from _msg
  | filter attributes.request_id:="替换为实际请求ID"
```

查请求触发的任务日志时，使用 `attributes.trigger_request_id`；查任务与子任务时分别使用 `attributes.task_id` 和 `attributes.parent_task_id`。

按小说查抓取记录：

```text
_time:1h
  | unpack_json from _msg
  | filter attributes.novel_id:=123
```

查询超过 3 秒的外部请求：

```text
_time:1h
  | unpack_json from _msg
  | filter attributes.event:="http.request.completed" AND attributes.duration_ms:>3000
```

按接口统计 5xx：

```text
_time:1h
  | unpack_json from _msg
  | filter attributes.event:="http.request.completed" AND attributes.status:>=500
  | stats by (attributes.pathname) count() as errors
```

按接口统计请求量与 P95：

```text
_time:1h
  | unpack_json from _msg
  | filter attributes.event:="http.request.completed" AND attributes.duration_ms:*
  | stats by (attributes.pathname) count() as requests, quantile(0.95, attributes.duration_ms) as p95_ms
```

默认 info 会省略成功的健康检查和静态资源，以上统计代表保留的请求完成日志，不是完整站点流量指标。路由 pathname 包含实体 ID，需要按路由汇总时应在查询中归一化路径。[LogsQL 语法](https://docs.victoriametrics.com/victorialogs/logsql/)

这些语句需要在部署后的 Fly 实例中验收。未接入 tracing 后端，因此查询结果不会出现 span 瀑布图。

## 退出与验证

SIGINT/SIGTERM 停止新 HTTP 请求和 cron，短暂等待已有请求后关闭 LoggerProvider，等待 stdout 写入回调。日志 shutdown 默认限时 3 秒；进程级退出从收到信号起也有 3 秒总上限。不可恢复的进程异常记录后以非零状态退出。强制终止、暂停、输出阻塞或 deadline 到期仍可能丢失尾部日志，不保证持久化交付。

自动测试覆盖真实 SDK 输出、日志过滤与序列化、失败输出、异步排空、幂等初始化、并发请求/SSR、队列共享和嵌套、缓存与延迟任务。生产冒烟测试解析 `server.started` 获取端口，并检查客户端产物不包含 OTel SDK。测试使用内存处理器、临时 SQLite 或本地替身，不依赖真实抓取服务。
