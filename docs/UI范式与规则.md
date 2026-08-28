# SSH-OS · UI 范式与规则（本项目 UI 规范）

> 本文档是**本项目的 UI 开发规范**，与 `docs/03-界面设计.md`（视觉规格）、`docs/02-技术架构.md`（技术实现）配套；写组件前先读本文档，与代码冲突时以本文档为权威。
> 基础组件一律以 shadcn/ui（new-york + Tailwind v4）为准；主题 token 单一事实见 `globals.css`（全量 shadcn token + 语义色）。

## 设计原则

1. **桌面外壳范式**：一个 SSH 连接 = 一个桌面 Tab；`window / panel / statusbar` 三态 surface 承载功能；窗口管理是纯客户端 Zustand 状态，不走服务端。任何新增功能先问"它该是哪个 surface"。
2. **一致性优先**：同一概念全仓同一视觉、同一命名；不引入与既有 token 体系无关的临时色、临时组件。
3. **克制**：不加不必要的装饰层、抽象层；能组合现有组件就组合，禁止为单个场景新建底座组件。
4. **性能内建**：流式数据（PTY / metrics / AI）不进全局 store；重库（xterm / TanStack Charts / 编辑器）动态 import；大列表虚拟化。
5. **反馈必达**：任何异步操作必须有可见反馈（loading / toast / 乐观更新），禁止静默吞错。

## 主题与 Token 规则

### 主题 token 单一事实
- 所有**颜色、圆角、间距、字号**必须来自 CSS 变量 token（`globals.css` 定义的全量 shadcn token + 项目语义色家族 + 数据色板 + 品牌色 + 终端色板 + `--radius` / `--spacing` / `--text-*`）。
- **禁止**：硬编码 hex / rgba、`bg-white/10`、`hover:bg-white/10` 等"只对单主题有效"的覆盖写法、内联 `style={{ color: "var(--x)" }}`、魔法圆角 / 魔法间距 / 魔法字号。
- Tailwind 侧通过 `@theme inline` 把 token 映射为语义类（`bg-background / text-foreground / text-success / bg-destructive / rounded-sm / p-2 / text-sm / ring-ring`），组件内一律用这些类。

### 明暗与多主题
- 根元素四维度：`:root` = light、`.dark` = dark（scheme）、`data-theme="<palette>"`（配色 + 形状 / 密度 / 字阶可覆盖）、`data-density`（间距密度）与根 font-size（字阶）。切换只改根元素属性，组件代码**不做任何主题分支判断**。
- 新颜色必须同时给 light 与 dark 两套值，并保证 WCAG AA 对比度。
- 密度 / 字阶为独立偏好（`appearance.density` / `appearance.fontScale`），与配色 palette 解耦可叠加。

### 状态色语义映射（全链路一致）
| 语义 | token | 场景 |
| --- | --- | --- |
| safe / 在线 / 成功 | `success`（绿） | 命令 safe、连接在线、操作成功 |
| review / 连接中 / 警告 | `warning`（黄） | 命令 review、连接中（脉冲）、超时、磁盘告警 |
| block / 异常 / 危险 | `danger`（红） | 命令 block、连接异常、删除确认、致命错误 |
| 信息 / 离线 | `muted`（灰） / `info`（蓝） | 离线状态、辅助信息、链接 |
| 品牌 / 数据 | `app-*` / `chart-*` | 桌面图标配色、监控图表、分组色条 |

> Policy 三态（safe/review/block）在 UI、日志 `classification`、命令卡片上的颜色**必须**与上表一致。

### 终端色板独立
- 终端 ANSI 配色走 `--terminal-*` 独立 token，与 UI 主题解耦（docs/03 §5.10）；xterm `theme` 从该 token 读取，禁止硬编码 `#000000` 等。终端字号读 `--terminal-font-size`（默认 14px），独立于 UI 字阶。

### 形状（圆角）规则
- 单一事实 `--radius`（默认 8px），shadcn 派生档 `rounded-sm/md/lg/xl` 对应 标签 4 / 按钮与输入框 6 / 卡片与面板 8 / 窗口 12。
- **禁止**：`rounded-[6px]`、`rounded-md` 之外的散值圆角；语义按组件身份选档（按钮一律 `rounded-md`，卡片一律 `rounded-lg`，窗口一律 `rounded-xl`），不做逐处微调。
- 主题适配：palette 可整体覆盖 `--radius` 改变圆润 / 锐利风格，组件代码不感知。

### 间距规则
- 4px 基准网格，全部用 Tailwind spacing utility 整数档（`p-1/p-2/p-3/p-4`、`gap-1..6`、`mx-1` 等）或语义间距常量：图标间隙 4 / 控件内边距与桌面图标间距 8 / 窗口内距 12 / 区块内距 16 / 区块间距 24。
- **禁止**：`px-[13px]`、`p-[7px]` 等魔法值；同类元素间距全仓一致。
- 主题适配：全局密度由 `--spacing`（`data-density`）驱动，组件代码不感知；禁止在组件里对密度做条件分支。

### 字号规则
- 项目字号档（rem 体系）：10（辅助角标）/ 12（桌面图标标签、任务栏、状态栏、时间戳）/ 14（表单、正文次要、代码）/ 16（正文）/ 标题档 H2 26、H1 32。
- 组件语义定档：正文 `text-sm/text-base`、状态栏与图标标签 `text-xs`、辅助角标 `text-2xs`、标题用标题档；代码一律 `font-mono`（JetBrainsMono）。
- **禁止**：`text-[13px]` 等散值；正文档位不逐处微调。
- 主题适配：字阶由根 font-size（`appearance.fontScale`）全局缩放，组件代码不感知。

## 组件分层与使用规则

### 分层职责
| 目录 | 职责 | 约束 |
| --- | --- | --- |
| `components/ui/` | shadcn 底座（CLI 生成） | 不手工改视觉，仅按需安装 |
| `components/shared/` | 项目私有可复用组件 | 至少被 2 处复用才进；单处使用就近放 app 内 |
| `components/shell/` | 应用外壳（Sidebar / TabBar / Desktop / Taskbar / Window） | 外壳不承载业务数据 |
| `apps/<app>/` | 插件 + 视图 + functions/server/schemas | 视图组件属于 app，不进 shared |

### 选型表（遇到场景先查此表）
| 场景 | 用 | 不用 |
| --- | --- | --- |
| 按钮 / 输入 / 选择 / 开关 / 标签 | shadcn `Button / Input / Select / Checkbox / Switch / Badge` | 裸 `<button>/<input>` |
| 居中弹窗 / 侧滑抽屉 / 二次确认 | `Dialog / Drawer(vaul) / AlertDialog` | 手写遮罩卡片 |
| 右键菜单 / 下拉 / 悬浮提示 | `ContextMenu / DropdownMenu / Tooltip / Popover` | 自监听 window 事件手写 |
| 表格 / 表单 | `@tanstack/react-table` + shadcn `Table`；`@tanstack/react-form` + shadcn 控件 | 手写 `<table>/<form>` |
| 成功/失败提示 | `sonner` toast；表单内用 `Banner` | `setState` 文本 + `console.error` 静默 |
| 加载中 | `Skeleton` / `Button` loading（spinner） | "加载中…"纯文本 |
| 空态 | `shared/EmptyState` | 各处手写空态 |
| 状态点 / 指标卡 / 图表 | `StatusDot / MetricCard / TrendChart` | 各处手写重复 |
| AI 命令 | `shared/CommandCard`（Policy 三态） | 命令结果纯文本平铺 |

### 新增组件检查清单
1. shadcn 是否已有？→ 有则直接用 / 组合。
2. 项目内是否已存在类似实现？→ 复用 `shared/`，删除旧重复。
3. 多个 app 都要用？→ 放 `shared/`；否则放消费它的 app 目录。
4. 命名：组件 `PascalCase.tsx`，文件级注释第一行概述职责（简体中文）。

## 图标规则
- 一律 `@remixicon/react`，**禁止** emoji、Unicode 字符（`✕ ✎ ⚙ ＋ ⋮⋮` 等）、字母首字当图标。
- `manifest.icon` 字符串统一经 `shared/AppIcon` 映射为 Remix 图标 + 品牌色；渲染层不直接读 `manifest.icon` 原始字符串。
- 图标用 `currentColor` 继承语义色，`size` 默认 16/20，桌面图标 24。

## 动效规则
- 统一 `motion`（`motion/react`）+ 动效令牌（`--duration-fast/base/slow`、`--ease-standard/emphasized`）。
- 允许的动效场景：窗口进出场/最小化/聚焦、抽屉与弹窗滑入滑出、桌面图标 hover/选中、任务栏与 Tab 指示条、列表增删（AnimatePresence + layout）、监控数字 count-up 与进度条。
- 布局类属性（width/height/top/left）动画避免引起重排抖动；连续帧动画用 transform/opacity。
- 必须支持 `prefers-reduced-motion`（用户偏好减少动态时降级为瞬时/淡入淡出）。

## 交互反馈规则
- **异步必有反馈**：发起时 loading（spinner + disabled + `aria-busy`），成功/失败给 toast 或就地结果；写操作成功走查询失效 + toast。
- **禁止静默吞错**：服务端错误经 `sfErrorLogger` 落审计并重抛；客户端 `catch` 后 toast / Banner 展示，禁止空 `catch {}`。
- **Policy 三态视觉**：safe 绿（左边框 + 执行按钮）/ review 黄（审批按钮）/ block 红（拦截原因，无执行按钮），经 `CommandCard` 统一。
- **窗口焦点态**：聚焦窗口 titlebar 高亮 + shadow 加深，失焦降级；窗口状态（最小化/最大化/聚焦）由 store 驱动，组件只读渲染。

## 桌面范式交互规则
| 交互 | 规则 |
| --- | --- |
| 打开连接 | 一个连接一个 Tab；重复打开聚焦已有 Tab（决策「Tab 边界」），不新建 |
| 桌面图标 | 单击选中（品牌色高亮 + 半透明底），双击打开窗口 |
| 窗口 | 拖标题栏移动、拖右下角缩放、双击标题栏最大化/还原、最小化收任务栏、点击聚焦置顶 |
| 任务栏 | 点击切换聚焦/最小化；statusbar 槽位常驻（如时钟） |
| 面板 | panel surface 固定桌面右上角槽位，自启 |

## 文本与国际化
- 界面文案一律**简体中文**，优先走 i18n（`t()` key），禁止硬编码中文字面量散落组件。
- 同一概念全仓用语一致（如"连接/分组/审批"不混用）。
- 注释与提交信息使用简体中文（遵循 AGENTS.md 语言规范）。

## 无障碍与平台
- 可交互元素必须有 `focus-visible` ring（统一 `ring` token）、可辨识的 hover/active 态与 aria-label。
- 键盘可达：弹窗 Esc 关闭、Enter 提交、对话框焦点圈定（shadcn 内建）。
- 滚动条样式统一（自定义 webkit 滚动条 token），不依赖系统默认外观。
- 颜色差异不得作为唯一信息载体（状态色同时配图标/文字）。
- 字号全局缩放（`appearance.fontScale`，含更大字号档）服务于可读性无障碍；动效遵守 `prefers-reduced-motion`。

## 代码约束
- 组件行数：文件 300 行预警 / 400 行强制拆分；函数 40 行预警 / 60 行强制拆分；拆分优先抽子组件 / hooks / 常量表（遵循 AGENTS.md 编码原则）。
- 禁止压缩排版、删除必要空行、用缩短命名规避行数。
- 新增依赖必须走评审：优先 shadcn / TanStack / Remix / motion 生态，避免重复造轮子。

## 边界红线（重构不得触碰）
- SFn / Server Route 架构、三层分离（.server / .functions / .schemas）。
- 策略引擎挂载边界与审批无绕过路径（review 必须经 Approval Registry + approvalSFn 重放）。
- 流式数据不进全局 store；渲染层只经 SFn / Server Route / WebSocket（PTY）与 web 服务通信。
- 包边界 importProtection（ssh2 / pi-coding-agent 不进 renderer bundle）。
- 桌面窗口状态纯客户端，不落服务端。
