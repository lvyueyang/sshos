# TODO 清单

集中登记评审 / 讨论产生的待办事项，后续按优先级完善。
条目状态：**待做**（已定方向未实施）/ **待 spike**（先验证可行性再定实现）。
完成后移入 `docs/04-决策记录.md` 校准记录并删除本条。

## AI 对话

| 状态 | 待办 | 说明 | 参考 |
| --- | --- | --- | --- |
| 待做 | 对话历史持久化 | AiPanel 的 `messages` 仅为组件内 `useState`，关闭 AI 窗口 / 切换 Tab / 刷新后丢失，上下文随之断裂。把 `messages` 持久化到 `connection_setting`（key=`app.ai.state`，走现成 settings 网关），重开 AI 窗口恢复上次对话。不改引擎（每次仍新建 Pi session），恢复的是对话文本与上下文 | `apps/ai/AiPanel.tsx`、`services/settings/connections/settings.functions.ts` |
| 待 spike | 服务端复用 Pi session | 当前 `chat.server.ts` 每次请求 `createPiAgent` 新建 session（请求级无状态，注释「Pi 会话为请求级，无跨请求记忆」），Pi 会话记忆（session 树延续 / 可分支 / 可导出）未启用。先验证 Pi 0.84.2 是否支持跨请求恢复 session，再定实现；需处理 session 生命周期 / 并发 / 清理 | `services/ai/chat/chat.server.ts`、`services/ai/pi-agent.ts` |
| 待做 | 连接级模型覆盖 | D22 已落地全局默认模型 + 系统设置 UI；连接级模型覆盖（每连接在 `connection_setting` 指定 model）随「服务端复用 Pi session / 每连接 Pi Host」一并接入 | `services/ai`、决策记录 D22 |
| 待做 | OAuth / 订阅登录 | pi 支持 ChatGPT/Claude 订阅、GitHub Copilot、OpenRouter OAuth 等订阅型登录；当前设置 UI 仅支持 API Key。订阅登录需浏览器授权流，列入后续 | `services/ai`、决策记录 D22 |
| 待做 | 内置 provider 代理覆盖 | `models.json` 支持为内置 provider 覆盖 `baseUrl`（代理路由），设置 UI 的 Provider 抽屉当前仅自定义 provider 可配 baseUrl，内置仅密钥管理 | `services/ai`、决策记录 D22 |

## 日志审计

| 状态 | 待办 | 说明 | 参考 |
| --- | --- | --- | --- |
| 待做 | 终端命令追踪精确化 | 已知局限：经 readline 光标移动编辑的命令按「输入字符顺序」记录，而非最终成行文本；密码抑制依赖 PTY 输出提示匹配启发式，非 100% 覆盖所有密码场景。更精确的捕获依赖 shell 集成（`PROMPT_COMMAND` 钩子，见 docs 02 §5.6「后续迭代」） | `apps/terminal/command-tracker.ts` |
| 待做 | 日志导出 | docs 02 §4.3 承诺结构化日志可导出 Excel/CSV（hucre），尚未实现；可在日志应用补导出按钮 | `apps/logs/LogsWindow.tsx` |
| 待做 | `log` 表保留策略 | 结构化日志无保留期限 / 清理策略，长期运行持续增长；需定保留策略（按天 / 条数上限清理） | `db/schema.ts`、`lib/batch-writer.ts` |
| 待做 | BatchWriter 持续失败保护 | 失败条目放回头部指数退避重试（已实现），但持续失败时 buffer 无容量上限丢弃策略，可能无限增长；补「超限丢弃最旧」保护 | `lib/batch-writer.ts` |

## 跨连接文件操作

| 状态 | 待办 | 说明 | 参考 |
| --- | --- | --- | --- |
| 待做 | 跨连接文件复制 | 一连接一 Tab，文件复制目前只限单连接内（同 Tab SFTP 会话内 rename/move）。跨连接复制需本地 web 服务为中继：源连接 SFTP 读取 → 本地流式透传 → 目标连接 SFTP 写入，复用 `services/transfer` 流式能力避免整文件进内存；写入目标为低风险新建，读取方不应触发策略，最终在目标侧落一条安全操作（与上传同权）。UI 落地形态：文件管理器「复制到其他连接…」入口 + 目标连接/目录选择 | `services/transfer/transfer.server.ts`、`services/ssh/sftp/sftp.server.ts`、`apps/files/files.functions.ts`、`apps/files/FileManager.tsx` |
| 待做 | 拖动跨连接复制 | 两个不同 Tab 的文件管理器窗口之间 HTML5 拖拽复制：把源连接 + 路径上下文随 DnD payload 传递，落到目标窗口时经「跨连接复制 SFn」执行，并区分拖拽复制 / 移动（同连接内已支持 rename 移动） | `apps/files/FileManager.tsx`、`apps/files/app.ts` |
| 待做 | 快捷键复制粘贴 | 文件管理器内 Ctrl+C 选中复制、Ctrl+V 粘贴；支持粘贴到另一连接的文件管理器窗口（跨连接目标），与拖拽同一套跨连接复制 SFn 底层 | `apps/files/FileManager.tsx` |
| 待做 | 全局 Agent 跨连接操作 | 当前 AI 面板按 Tab 挂载、工具 handler 绑定单连接 sessionId；跨连接复制等操作需要「全局 Agent」（不绑定单连接 Tab 的面板）作为第二消费者复用同一读写网关，工具 handler 可携带源/目标连接参数，进而支持跨连接复制、对比、同步等编排 | `services/ai/pi-agent.ts`、`apps/ai/AiPanel.tsx`、`services/ssh/command/exec.service.ts` |

## 编辑器（Monaco）

| 状态 | 待办 | 说明 | 参考 |
| --- | --- | --- | --- |
| 待做 | 编辑器 app（Monaco Editor） | 新 `apps/editor`：基于 Monaco Editor（VSCode 核心）编辑远程文件。window surface + `sftp` 能力：SFTP 读取打开 / 保存写回（写回为低风险新建，与 mkdir/上传同权 safe 放行）。Monaco 体积大，须动态 import 按需加载避免拖累主包（性能内建），语言服务随打开文件类型按需注册 | `apps/editor/`（新建）、`services/ssh/sftp/sftp.server.ts`、`app-framework/types.ts`、`vite.config.ts` |
| 待做 | 文件管理器「用编辑器打开」 | 复用上下文菜单贡献点：files app 右键文件 → 「用编辑器打开」唤起 editor app 并打开该远程文件（`contributes.contextMenus` + `ctx.menus.registerHandler`） | `apps/files/app.ts`、`app-framework/types.ts` |
| 待做 | 终端 vi 模式智能提示 | 终端进入 vi/vim/nano 时（command-tracker 已捕获输入行，可识别 `vi`/`vim` 命令前缀）智能提示改用编辑器 app；复用 `stores/ui.ts` 一次性预填机制（aiInstallSignal/consumeAiInstall）预填「用编辑器打开当前文件」，给出「继续终端编辑 / 打开编辑器」选择，避免打断用户 | `apps/terminal/command-tracker.ts`、`apps/terminal/TerminalWindow.tsx`、`apps/ai/AiPanel.tsx`、`stores/ui.ts` |
