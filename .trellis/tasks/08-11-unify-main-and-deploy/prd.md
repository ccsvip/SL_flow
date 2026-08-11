# PRD — 统一 main 分支并更新服务器部署

## 背景

`SL_flow` 目前存在三处代码状态不一致：

| 位置 | 分支 | HEAD | 说明 |
|---|---|---|---|
| GitHub `ccsvip/SL_flow` | `master`（默认分支） | `4ee390c` | 含 Caddy HTTPS 部署配置 |
| GitHub | `main` | `2b17394` | 含密钥二次编辑 + 登录/运维 UI 重做 |
| 本地 `C:/code/mine/SL_flow` | `dev` | `2b17394` | 与 origin/main 同点 |
| 服务器 `/root/workspace/SL_flow` | `dev` | `4ee390c` | 与 origin/master 同点 + 2 个未提交文件 |

`master` 与 `main` 已分叉，各有 3 个提交，互不为祖先。

## 需求

1. **合成最新代码**：产出同时包含 `master` 与 `main` 两侧全部有效改动的单一代码线，落在 `main` 分支上。
2. **备份服务器**：在任何变更前完成服务器代码、数据库、环境配置、未提交改动的完整备份。
3. **更新服务器**：服务器切换到最新 `main`，重建镜像、执行数据库迁移、验证服务健康。
4. **收敛分支**：
   - 服务器只保留 `main` 一个分支
   - GitHub 远端只保留 `main` 一个分支
   - 本地保留 `main` 与 `dev` 两个分支：先只留 `main`，删除其余全部分支，再 `git checkout -b dev`

## 约束与既定判断

- **`2c0aae9 linux -init` 是纯换行符转换提交**：58 文件 15116 增 / 15116 删，`--ignore-cr-at-eol` 下零改动。合并时必须按行尾归一化处理，否则会在几乎所有文件上产生假冲突。
- **服务器 2 个未提交文件的取舍**：`frontend/src/pages/APIKeysPage.tsx`（+173/-14）与 `frontend/src/styles/global.css`（+33/-19）是在服务器上手改出的密钥二次编辑功能（内联编辑卡片实现）。本地 `main` 的 `0330b2c` 提交是同一功能的另一套实现（Modal 弹窗），更新时间更靠后（2026-06-30）且已配套 `types.ts` 与后端路由改动。
  **取本地 `main` 版本，丢弃服务器手改版本**；丢弃前必须导出为 patch 文件留档，保证可恢复。
- **删除 GitHub `master` 前必须先把默认分支切到 `main`**，否则 GitHub 拒绝删除默认分支。
- **删除远端 `master` 前必须先把合并后的 `main` 推送成功**，否则丢失 Caddy 部署配置。
- 数据库迁移只前进不回退：服务器当前 alembic 版本 `0009_managed_api_key_owner`，目标 `0010_audit_action_reveal`。
- 服务器 `.env` 与本地 `.env` 各自独立（均被 gitignore），不做同步。
- 本地 `core.autocrlf=true`，仓库无 `.gitattributes`。归一化后仓库内为 LF、本地工作区为 CRLF、服务器工作区为 LF，三方自洽。

## 验收标准

| # | 条件 |
|---|---|
| 1 | 本地 `main` 树中同时存在 `deploy/caddy/Caddyfile`、`wiki/caddy-https-domain.md`、`docker-compose.yml` 的 caddy 服务块与 caddy volumes |
| 2 | 本地 `main` 树中同时存在 `0010_audit_action_reveal.py`、`audit_log.py` 的 `reveal` 枚举、`APIKeysPage.tsx` 的 Modal 版二次编辑、`LoginPage.tsx` / `OpsPage.tsx` / `global.css` 的 UI 重做 |
| 3 | frontend `npm run build` 通过 |
| 4 | `origin/main` == 本地 `main` |
| 5 | 服务器备份存在且可校验：代码 tar、`pg_dump` 输出、`.env` 副本、未提交改动 patch，全部落盘且非空 |
| 6 | 服务器 `git status` 干净，HEAD == `origin/main`，工作区文件与本地 `main` 逐文件哈希一致（忽略行尾） |
| 7 | 服务器 `alembic current` == `0010_audit_action_reveal (head)` |
| 8 | 服务器四个容器（backend / frontend / db / caddy）均 Up，前端可访问，后端健康 |
| 9 | 服务器 `git branch` 只有 `main` |
| 10 | `git ls-remote --heads origin` 只有 `refs/heads/main`，且 GitHub 默认分支为 `main` |
| 11 | 本地 `git branch` 只有 `main` 与 `dev`，当前在 `dev` 上，`dev` 与 `main` 同点 |

## 非目标

- 不新增 `.gitattributes`（虽推荐用于根治行尾漂移，但超出本次范围，仅在收尾时提示）
- 不合并两套密钥编辑实现的 UI 差异，不做功能重新设计
- 不同步 `.env` 内容，不修改服务器凭据
- 不改动本次 trellis 初始化产物之外的工具配置
