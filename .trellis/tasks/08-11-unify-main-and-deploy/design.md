# Design — 统一 main 分支并更新服务器部署

## 1. 合并策略

### 问题

`dev`(=`origin/main`) 与 `origin/master` 的合并基是 `86ff4bc`。`origin/master` 的 `2c0aae9 linux -init` 把 58 个文件从 LF 全量转成 CRLF。因此：

- 对 `dev` 未改动的文件：`dev` == base，master 单侧改动 → git 直接取 master 版本，无冲突，但结果是 CRLF blob。
- 对 `dev` 改动过的文件（`APIKeysPage.tsx` / `LoginPage.tsx` / `OpsPage.tsx` / `global.css` / `types.ts` / `audit_log.py` / `AuditLogsPage.tsx`）：两侧都改了同一批行 → **每个 hunk 都冲突**，且冲突内容全是 `\r`。

### 方案

用 `git merge origin/master -X renormalize`。`renormalize` 对三方的每个 stage 做一次虚拟 check-out/check-in，在 `core.autocrlf=true` 下即把三侧统一归一化为 LF 再做三方合并，CR-only 差异直接消失。

预期结果：
- 语义冲突为零（两侧语义改动文件集不相交：dev 侧改 8 个业务文件，master 侧只新增 `deploy/caddy/Caddyfile`、`wiki/caddy-https-domain.md` 并改 `docker-compose.yml`，而 `docker-compose.yml` 在 dev 侧 blob == base blob，单侧改动）。
- 合并后仓库内 blob 统一为 LF；本地工作区经 autocrlf 仍是 CRLF；服务器工作区是 LF。三方自洽。

### 备选（仅当 renormalize 仍产生大量假冲突时）

`git checkout --ours` / `--theirs` 逐文件挑不可行（会丢改动）。备选是放弃 merge，改为在 `main` 上 cherry-pick `b932a89`（caddy 配置）与 `4ee390c`（wiki 修正），跳过纯格式提交 `2c0aae9`。代价是丢失 master 的提交身份（内容不丢）。**决策点：先试 merge，失败即降级 cherry-pick，不做逐文件手工拼接。**

## 2. 服务器未提交改动的处置

服务器 `dev` 分支 == `origin/master`，无未推送提交，只有 2 个 dirty 文件。处置顺序：

1. `git diff > 备份路径/server-uncommitted.patch`（含两个文件全部改动）
2. `git stash` 不用——直接 `git checkout -- <两个文件>` 前先确认 patch 非空
3. 再切分支

这样即使日后想恢复内联编辑实现，`git apply` patch 即可。

## 3. 备份设计

备份根目录：`/root/backup/SL_flow-YYYYmmdd-HHMMSS/`

| 产物 | 命令要点 | 校验 |
|---|---|---|
| `code.tar.gz` | `tar czf` 整个 `/root/workspace/SL_flow`（含 `.git`、`.env`），排除 `node_modules` | 文件非空 + `tar tzf` 可列出 |
| `db.sql.gz` | `docker compose exec -T db pg_dump -U <user> <db>` 管道 gzip | 文件非空 + 末尾含 `PostgreSQL database dump complete` |
| `dotenv.bak` | `cp .env` | 非空 |
| `server-uncommitted.patch` | `git diff` | 非空且含两个文件路径 |
| `manifest.txt` | 记录备份时刻的 `git log -1`、`git status`、`alembic current`、`docker compose ps`、各产物 sha256 | 非空 |

数据库连接参数从服务器 `.env` 读取，不回显明文到会话输出（只取变量名注入命令）。

**备份必须在服务器任何写操作之前完成并校验通过**，校验失败即中止，不进入更新阶段。

## 4. 服务器更新设计

顺序（任一步失败即停，不继续）：

1. `git fetch origin --prune`
2. 丢弃 dirty 文件（patch 已留档）
3. `git checkout -B main origin/main` — 用 `-B` 一步创建/重置并切换
4. 校验 `git rev-parse HEAD` == `origin/main`，`git status --porcelain` 为空
5. `docker compose build backend frontend` — 前端产物在镜像内，必须重建才能生效
6. `docker compose up -d`
7. `alembic upgrade head`（在 backend 容器内）
   - 注意：`entrypoint.sh` 可能已自动跑迁移，先 `alembic current` 判断，已是 head 就跳过
8. 健康校验：`docker compose ps` 四容器 Up、`curl` 后端健康端点、`curl` 前端首页
9. 逐文件哈希比对服务器工作区 vs 本地 `main`（忽略行尾），确认内容一致

回滚点：备份的 `code.tar.gz` + `db.sql.gz`。回滚形状 = 停容器 → 解压覆盖 → 恢复库 → `docker compose up -d --build`。

## 5. 分支收敛设计

严格顺序，每步后校验：

```
① 本地 main 合并完成并 build 通过
② 推送 main → origin/main            （此后 master 的内容已在 main 中，可安全删除）
③ GitHub 默认分支切到 main            （gh api PATCH /repos/{owner}/{repo} -f default_branch=main）
④ 删除 origin/master                  （git push origin --delete master）
⑤ 服务器：git checkout main 后 git branch -D dev；git remote set-head origin -a
⑥ 本地：切到 main，删除 dev 及其余所有本地分支
⑦ 本地：git checkout -b dev
```

②③④ 的顺序不可交换：③ 之前删 master 会被 GitHub 拒绝；② 之前删 master 会丢代码。

⑤ 在服务器上删 `dev` 必须先切到 `main`（不能删当前分支）。

⑥ 本地分支清单当前为 `dev` + `main`。切到 `main` 后 `git branch -D dev`，再枚举剩余分支确认只有 `main`。

⑦ `git checkout -b dev` 从 `main` 分出，`dev` 与 `main` 同点，且 `dev` 不设 upstream（远端已无 dev 分支）。

## 6. 风险与兜底

| 风险 | 影响 | 兜底 |
|---|---|---|
| merge 产生大量假冲突 | 阻塞 | 降级 cherry-pick（见 §1） |
| 服务器手改实现被丢弃后用户反悔 | 功能回退 | `server-uncommitted.patch` 可 `git apply` 恢复 |
| 镜像重建失败 | 服务中断 | 旧镜像仍在本地，`docker compose up -d` 可回退；code.tar.gz 全量回滚 |
| `alembic upgrade` 失败 | 数据层不一致 | `db.sql.gz` 全量恢复 |
| 删除 origin/master 后发现遗漏 | 远端历史丢失 | `master` 的 SHA `4ee390c` 记录在 manifest 与本文档；GitHub 90 天内可通过 SHA 恢复引用，本地 `main` 的合并提交亦保留其祖先 |
| 本地删除 dev 后发现遗漏 | 本地引用丢失 | `dev` == `2b17394`，已是 `main` 的祖先，SHA 记录在案 |

## 7. 关键 SHA 留档

| 引用 | SHA |
|---|---|
| 合并基 | `86ff4bc5e1e751c4252281397d80c83fe326545c` |
| 删除前 `origin/master` | `4ee390c123cb3f9a9b6e2cebe7d5a904bc00dbae` |
| 删除前本地 `dev` / `origin/main` | `2b1739410cab4d06906a5a322b53e3aa67835e91` |
| 纯格式提交（合并时被归一化吸收） | `2c0aae9bd95c9d279d889f29e1debffbaf4a2d90` |
