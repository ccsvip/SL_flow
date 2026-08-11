# Implement — 统一 main 分支并更新服务器部署

执行顺序不可打乱。每个阶段末尾的「门禁」不通过就停在该阶段，不往下走。

---

## 阶段 A：本地合并出最新代码

- [ ] A1 切到本地 `main`（当前在 `dev`；两者同点，无未提交业务改动）
      `git checkout main`
- [ ] A2 确认 `main` == `origin/main`：`git rev-parse main origin/main`
- [ ] A3 合并：`git merge origin/master -X renormalize -m "合并 master 的 Caddy HTTPS 部署配置到 main，统一行尾"`
- [ ] A4 若有冲突：只允许出现在 `docker-compose.yml`；其他文件出现冲突 → 中止 merge（`git merge --abort`）并降级为 cherry-pick `b932a89` + `4ee390c`
- [ ] A5 验证合并树内容（验收 1 / 2）：
      - `git show main:deploy/caddy/Caddyfile | head` 有内容
      - `git ls-tree main -- wiki/caddy-https-domain.md` 命中
      - `grep -c 'caddy' docker-compose.yml` ≥ 1 且含 `caddy_data` / `caddy_config`
      - `git ls-tree main -- backend/migrations/versions/0010_audit_action_reveal.py` 命中
      - `grep 'reveal' backend/app/models/audit_log.py` 命中
      - `grep 'APIKeyUpdateInput' frontend/src/pages/APIKeysPage.tsx` 命中
- [ ] A6 与两侧做交叉校验：`git diff --ignore-cr-at-eol main origin/master` 只应显示 dev 侧独有改动；`git diff --ignore-cr-at-eol main origin/main` 只应显示 master 侧独有改动
- [ ] A7 前端构建门禁：`cd frontend && npm run build`（验收 3）
- [ ] A8 后端语法门禁：`python -m compileall backend/app -q`（无 venv 时跳过并记录）

**门禁 A**：A5 全部命中 + A7 通过。不通过不进入阶段 B。

---

## 阶段 B：推送 main

- [ ] B1 `git push origin main`
- [ ] B2 校验 `git ls-remote --heads origin refs/heads/main` == 本地 `main` SHA（验收 4）

**门禁 B**：B2 一致。此后 master 内容已安全落在远端 main，方可删除 master。

---

## 阶段 C：备份服务器（在服务器任何写操作之前）

- [ ] C1 生成备份目录 `/root/backup/SL_flow-<ts>/`
- [ ] C2 导出未提交改动 patch：`git diff > $BK/server-uncommitted.patch`
- [ ] C3 备份 `.env` → `$BK/dotenv.bak`
- [ ] C4 代码全量 tar（含 `.git`，排除 `node_modules`）→ `$BK/code.tar.gz`
- [ ] C5 数据库 `pg_dump | gzip` → `$BK/db.sql.gz`（连接参数取自 `.env`，不回显明文）
- [ ] C6 写 `$BK/manifest.txt`：`git log -1`、`git status`、`alembic current`、`docker compose ps`、各产物 sha256 与字节数
- [ ] C7 校验：4 个产物均非空；`tar tzf code.tar.gz | head` 可列出；`zcat db.sql.gz | tail -1` 含 dump 完成标记；patch 含两个目标文件路径

**门禁 C**：C7 全部通过（验收 5）。任一失败即停止，不动服务器。

---

## 阶段 D：更新服务器

- [ ] D1 `git fetch origin --prune`
- [ ] D2 丢弃 dirty 文件：`git checkout -- frontend/src/pages/APIKeysPage.tsx frontend/src/styles/global.css`
- [ ] D3 `git checkout -B main origin/main`
- [ ] D4 校验 `HEAD == origin/main` 且 `git status --porcelain` 为空（验收 6 前半）
- [ ] D5 `docker compose build backend frontend`
- [ ] D6 `docker compose up -d`
- [ ] D7 `alembic current`；若非 head 则 `alembic upgrade head`；再次 `alembic current` 校验为 `0010_audit_action_reveal (head)`（验收 7）
- [ ] D8 健康校验：`docker compose ps` 四容器 Up；`curl -sS -o /dev/null -w '%{http_code}'` 后端 + 前端（验收 8）
- [ ] D9 逐文件哈希比对服务器工作区 vs 本地 `main`（忽略 `\r`），应完全一致（验收 6 后半）

**门禁 D**：D4 / D7 / D8 / D9 全部通过。失败则按 design.md §4 回滚形状处理并上报，不继续删分支。

---

## 阶段 E：分支收敛

顺序严格，每步后校验。

- [ ] E1 GitHub 默认分支切到 `main`：`gh api -X PATCH repos/ccsvip/SL_flow -f default_branch=main`，校验 `gh repo view --json defaultBranchRef`
- [ ] E2 删除远端 `master`：`git push origin --delete master`，校验 `git ls-remote --heads origin` 只剩 `refs/heads/main`（验收 10）
- [ ] E3 服务器删除 `dev`：已在 `main` 上，`git branch -D dev`；`git remote set-head origin -a`；校验 `git branch` 只有 `main`（验收 9）
- [ ] E4 本地：`git checkout main`；`git branch -D dev`；`git remote prune origin`；校验 `git branch` 只有 `main`
- [ ] E5 本地：`git checkout -b dev`；校验 `git branch` 为 `main` + `dev`，当前在 `dev`，`git rev-parse dev main` 同 SHA（验收 11）

**门禁 E**：验收 9 / 10 / 11 全部通过。

---

## 阶段 F：收尾

- [ ] F1 复核全部 11 条验收标准，逐条给结论
- [ ] F2 trellis 3.3 spec 更新判断（行尾归一化这类坑值得入 spec）
- [ ] F3 提交本次产生的仓库改动（合并提交已在 A3；`.trellis/` 与 `.claude/` 等新增文件按 3.4 出提交计划待用户确认）
- [ ] F4 上报备份路径、被丢弃的服务器实现 patch 路径、`.gitattributes` 建议

---

## 验证命令速查

```bash
# 本地
git rev-parse main dev origin/main
git diff --ignore-cr-at-eol main origin/master --stat
cd frontend && npm run build

# 远端
git ls-remote --heads origin
gh repo view ccsvip/SL_flow --json defaultBranchRef

# 服务器（经 paramiko）
cd /root/workspace/SL_flow && git branch -vv && git status --short
docker compose ps
docker compose exec -T backend sh -lc 'cd /app && alembic current'
```
