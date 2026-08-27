# 开发测试机矩阵

SSH 集成测试与发行版适配（D20）验证用的多发行版测试机，统一由本目录 `docker-compose.yml` 管理。

## 容器清单

| 服务 | 镜像 | 发行版 | 端口 | 覆盖 |
|---|---|---|---|---|
| `sshos-test` | `linuxserver/openssh-server` | Alpine | `localhost:2222` | apk + busybox + OpenRC |
| `sshos-test-debian` | `Dockerfile.debian` | Debian 12 | `localhost:2223` | apt + GNU |
| `sshos-test-rocky` | `Dockerfile.rocky` | Rocky 9 | `localhost:2224` | dnf + GNU + systemd |

统一账号：`test` / `testpass`（密码认证，root 登录关闭）。该账号**仅限开发环境中 AI 测试/调试**使用。

## 常用命令

```bash
# 启动 / 重建（首次构建拉取基镜像并安装 openssh-server）
docker compose -f dev/docker/docker-compose.yml up -d --build

# 停止（保留容器与镜像）
docker compose -f dev/docker/docker-compose.yml down

# 查看状态
docker compose -f dev/docker/docker-compose.yml ps
```

根 `package.json` 提供了快捷脚本：

```bash
pnpm test:containers:up      # 等价 up -d --build
pnpm test:containers:down    # 等价 down
```

## 跑 SSH 集成测试

```bash
# 按发行版设 SSH_TEST_PORT 与 SSH_TEST_DISTRO
SSH_TEST_HOST=localhost SSH_TEST_PORT=2222 SSH_TEST_USER=test \
SSH_TEST_PASSWORD=testpass SSH_TEST_DISTRO=alpine \
pnpm --filter @sshos/web test
```

`SSH_TEST_DISTRO` 取值 `alpine | debian | rocky`，对应断言见
`packages/web/src/services/ssh/__tests__/ssh-integration.test.ts` 的 `EXPECTED_PROFILE`。

## 新增发行版

1. 在 `Dockerfile.<distro>` 装 openssh-server、建 `test`/`testpass` 用户、开启密码认证
2. 在 `docker-compose.yml` 加一个 service（端口顺延 2225…）
3. 在集成测试 `EXPECTED_PROFILE` 增加该发行版的预期 Profile（family / packageManager / coreutils）

> 本机 Docker 配置了 `credsStore: osxkeychain` 且拉取公开镜像时凭据助手被触发取消时，
> 可用最小配置跳过凭据助手：`DOCKER_CONFIG=.tmp/docker-config docker compose …`
> （`.tmp/docker-config` 需含 `contexts/` 与 `cli-plugins/`，见 `.gitignore` 已忽略）。
