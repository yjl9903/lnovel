# 解析包与 CLI

## bilinovel

`packages/bilinovel/src/index.ts` 导出 `novel.ts`、`top.ts`、`wenku.ts`、错误定义与类型。

| 模块 | 当前职责 |
| --- | --- |
| `novel.ts` | 小说信息、卷目录、分页章节解析及下架识别 |
| `top.ts` | 榜单筛选、标题和页面条目解析 |
| `wenku.ts` | 分类筛选、枚举映射、标题和页面条目解析 |
| `types.ts` | HTML 获取函数、图片转换和解析 hooks 等边界 |
| `utils.ts` | JSDOM 文档创建、时间与参数转换等公共解析辅助 |

调用方注入 `BilinovelFetch`：输入页面路径和可选 selector，返回 HTML 字符串。Server 提供浏览器实现，测试提供本地 HTML 实现。图片地址转换、日志和进度等通过参数传入；解析包不持有 Server 数据库或浏览器实例。

这里的 `wenku.ts` 处理当前抓取链路中的分类页面，不能仅依据文件名把它说明成另一个站点的独立抓取适配器。具体请求路径与筛选映射以该文件为准。

当前 `tsdown.config.ts` 只构建库入口 `src/index.ts`。虽然 manifest 声明了 `bilinovel` bin，`cli.mjs` 引用的 `dist/cli.mjs` 没有对应源码与构建入口，因此该 bin 不是可用的 CLI 能力。

## lnovel

`packages/lnovel/src/index.ts` 当前仅导出 `hello = 1`。`src/cli.ts` 注册了以下命令，但 action 均为空：

```text
bili top
bili wenku
bili novel <nid>
bili volume <nid> <vid>
bili chapter <nid> <cid>
```

根目录 `pnpm lnovel --help` 可用于查看命令定义，但不能据此宣称下载或 EPUB 导出已经实现。manifest 中的 EPUB 依赖也不构成功能完成的证据。

Server 自身 CLI 的 `start` 有运行实现；其 `bili novel`、`bili volume` 和 `bili chapter` 同样仍是空 action。

## 修改与验证

解析行为变化时同步更新调用契约、HTML fixtures 和有意义的结果断言，避免依赖在线站点。`packages/bilinovel/test/novel.test.ts` 现有小说测试通过本地 HTML 验证解析、分页和图片转换；`packages/lnovel/test/index.test.ts` 只是占位测试，不能作为 CLI 业务验收。详见 [测试说明](../testing.md)。
