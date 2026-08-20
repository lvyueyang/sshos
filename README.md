# SSH OS — 远程 Linux 桌面外壳

以**纯 SSH 协议、零 agent** 把远程 Linux 的文件、进程、软件、Docker 以桌面隐喻可视化呈现。一个 SSH 连接 = 一个 OS 桌面 Tab，用户像操作本地电脑一样操作远程服务器，AI 作为"第二消费者"接入同一套读写网关，所有危险命令经策略引擎拦截。

> 当前阶段：P0-P3 已落地（脚手架 / SSH 引擎 / 策略分类器 / web 基座），W0 三条流 spike 完成（PTY / metrics 流实测 + Pi SDK 定稿），SSH 集成测试经 Docker 测试机接入，详见 `docs/`。

## 特性

- **桌面外壳范式**：每个 SSH 连接打开一个仿 OS 桌面 Tab，桌面图标 + 窗口 + 任务栏完成全部操作
- **SSH 终端**：xterm.js 多终端窗口，PTY 流式，中文输入无乱码
- **SFTP 文件管理**：交互参考 Windows / macOS 文件管理器（工具栏、视图切换、拖拽语义、快捷键），右键菜单开放给 App 插件扩展
- **实时系统监控**：CPU / 内存 / 磁盘 / 网络仪表盘 + 桌面状态卡片
- **AI 原生集成**：Pi SDK 引擎，自然语言操作远程系统，命令卡片 safe / review / block 三级安全闭环
- **明暗双主题**：GitHub 配色基底，明暗一键切换，终端配色独立组合

## 界面预览

（截图占位，随实现补充）

## 技术栈

Electron · TanStack Start + React · TypeScript v7 · Tailwind CSS 4 + shadcn/ui · ssh2 + xterm.js · node:sqlite + Drizzle ORM · @tanstack/react-form / react-table · dayjs · hucre · i18next · Biome · Pino

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发（Electron 壳 + TanStack Start dev server）
pnpm dev

# 仅启动 web 开发
pnpm dev:web
```

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发（Electron 壳 + TanStack Start dev server） |
| `pnpm dev:web` | 仅启动 web 的 vite dev server（端口 3000） |
| `pnpm check` | 全部包 tsc --noEmit + Biome 检查 |
| `pnpm lint` / `pnpm lint:fix` | 全部包 Biome 检查 / 自动修复 |
| `pnpm format` | 全部包 Biome 格式化 |
| `pnpm test` | 全部包单元测试 |
| `pnpm build` | 生产构建（web 的 Nitro 产物） |

## 工程结构

单仓库多包（pnpm workspace）：

| 包 | 说明 |
|----|------|
| `@sshos/core` | 框架无关 SSH 核心逻辑（ssh2 连接 / PTY / SFTP / 指标采集） |
| `@sshos/policy` | 命令分类引擎（safe / review / block） |
| `@sshos/web` | TanStack Start 应用包（SFn / Server Route / 桌面应用插件 / App 插件框架） |
| `@sshos/desktop` | Electron 主进程（启动 web 构建产物或 dev server） |

## 文档

| 文档 | 说明 |
|------|------|
| [01 项目概述](docs/01-项目概述.md) | 定位、MVP 范围、W0-W4 实施路线 |
| [02 技术架构](docs/02-技术架构.md) | 分层架构、技术栈、SFn / Server Route 通信、App 插件框架、AI 安全策略引擎 |
| [03 界面设计](docs/03-界面设计.md) | 桌面外壳、终端、文件管理、监控、AI 面板全部界面规范 |
| [04 决策记录](docs/04-决策记录.md) | 关键技术决策 ADR（D1-D16），单一事实来源 |
| [05 界面框图](docs/05-界面框图.md) | 全界面 ASCII 框图与标注汇总 |

## 路线图

| 周次 | 主题 | 交付 |
| --- | --- | --- |
| W0 | 流式 spike | PTY / 监控 / AI 三条流式通道验证 |
| W1 | SSH + 终端流 | 连接管理、PTY 双向、Policy Engine v1 |
| W2 | SFTP + 监控 | 文件管理、流式传输、监控仪表盘、Policy v2 |
| W3 | AI + 安全闭环 | Pi Agent、Prompt 注入检测、审批、审计 |
| W4 | 打包发布 | 三平台安装包、自动更新、开源仓库 |

## 开发约定

详见 [AGENTS.md](AGENTS.md)。

## 协议

MIT
