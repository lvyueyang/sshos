# 贡献指南

感谢你参与 SSH OS 的开发。以下约定帮助协作顺畅，请先阅读 [AGENTS.md](AGENTS.md) 与 [docs/](docs/)（设计文档与决策记录为单一事实来源）。

## 环境要求

- Node.js ≥ 24（`node:sqlite` 依赖 Node 22.5+，Electron 43 内置 Node 24）
- pnpm ≥ 11（工作区安装：`corepack enable` 后自动使用）
- 平台：macOS / Windows / Linux 任一，SSH 集成测试需 Docker 测试机（见下）

## 快速开始

```bash
pnpm install
pnpm dev        # Electron 壳 + TanStack Start dev server
pnpm check      # 全部包 tsc --noEmit + Biome
pnpm test       # 单元测试
pnpm build      # web 生产构建（Nitro 产物）
```

## 工程约定

- 单仓库多包（pnpm workspace）：`packages/core`（SSH 引擎）/ `policy`（命令分类）/ `web`（TanStack Start 应用）/ `desktop`（Electron 主进程）
- 依赖方向：`web → core + policy`；`desktop → web`；跨包引用一律 `@sshos/*` subpath import，`#/*` 别名仅 web 包内生效
- 架构铁律：renderer 永不直连 Electron ipcMain，通信一律走 SFn / Server Route；策略引擎覆盖全部写操作类 SFn，无绕过路径
- 修改实现前先读设计文档；文档与实现冲突时以决策记录（`docs/04-决策记录.md`）为准

## 提交规范

- 使用 Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `test:` 等），信息用简体中文
- 一个提交只做一个逻辑改动；改动影响运行方式或验证命令时在提交说明中写明
- 禁止提交临时文件、密钥、`.env`、测试产物；临时文件统一放仓库根 `.tmp/`

## 代码质量

- 任务完成后必须执行 `pnpm check`，确保类型检查与 Biome 检查通过
- 文件/类超过 400 行、函数超过 60 行必须按职责拆分（预警阈值 300 / 40）
- 代码注释、文档、提交信息均使用简体中文；类型与方法需注释，贴近业务语义

## SSH 集成测试

core 包的 SSH 集成测试默认跳过，设置以下环境变量后启用。多发行版测试机由 `dev/docker/docker-compose.yml` 统一管理（Alpine `localhost:2222` / Debian `localhost:2223` / Rocky `localhost:2224`，统一账号 `test` / `testpass`）：

```bash
# 启动测试机矩阵（首次构建需拉取镜像；可用 pnpm test:containers:up）
docker compose -f dev/docker/docker-compose.yml up -d --build

# Alpine（默认发行版，不设 SSH_TEST_DISTRO 即 alpine）
SSH_TEST_HOST=localhost SSH_TEST_PORT=2222 SSH_TEST_USER=test \
SSH_TEST_PASSWORD=testpass pnpm test

# Debian / Rocky（按发行版设 SSH_TEST_DISTRO）
SSH_TEST_HOST=localhost SSH_TEST_PORT=2223 SSH_TEST_USER=test \
SSH_TEST_PASSWORD=testpass SSH_TEST_DISTRO=debian \
pnpm --filter @sshos/core test

SSH_TEST_HOST=localhost SSH_TEST_PORT=2224 SSH_TEST_USER=test \
SSH_TEST_PASSWORD=testpass SSH_TEST_DISTRO=rocky \
pnpm --filter @sshos/core test

# 停止矩阵（可用 pnpm test:containers:down）
docker compose -f dev/docker/docker-compose.yml down
```

> 说明：本机 Docker 若配置了 `credsStore: osxkeychain` 且拉取公开镜像时凭据助手被取消（`error getting credentials`），可用最小配置跳过：`DOCKER_CONFIG=.tmp/docker-config docker compose -f dev/docker/docker-compose.yml up -d --build`（详见 `dev/docker/README.md`）。

## 提交 Pull Request

1. 从 `main` 切出特性分支，命名 `feat/<描述>` / `fix/<描述>`
2. 完成实现与测试，跑通 `pnpm check`
3. 涉及设计决策变更时同步更新 `docs/04-决策记录.md` 并回填受影响文档
4. 开 PR 描述改动动机、影响范围与验证方式，`main` 分支通过 CI 后合入
