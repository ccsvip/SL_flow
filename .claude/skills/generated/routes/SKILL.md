---
name: routes
description: "Skill for the Routes area of SL_flow. 155 symbols across 24 files."
---

# Routes

155 symbols | 24 files | Cohesion: 75%

## When to Use

- Working with code in `backend/`
- Understanding how delete_attachment, delete_bug, delete_comment work
- Modifying routes-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/api/routes/prd.py` | regenerate_one_section, _to_full, _load_doc_or_404, _ensure_can_mutate, get_document (+20) |
| `backend/app/api/routes/system.py` | _read_local_version, _git_env, _run_git, _git_info, get_version (+6) |
| `backend/app/api/routes/db_backups.py` | download_backup, delete_backup, _decorate, list_backups, create_backup (+5) |
| `backend/app/api/routes/ops.py` | _run, _parse_size, _parse_percent, _docker_info, _container_states (+5) |
| `backend/app/api/routes/users.py` | _avatar_dir, _purge_old_avatar, update_user, delete_user, upload_my_avatar (+3) |
| `backend/app/api/routes/ai.py` | ai_status, test_ai_connection, _format_comments, summarize_entity, _get_or_create_settings_row (+3) |
| `backend/app/core/backup.py` | generate_backup_filename, sha256_of, safe_filename, env, parse_database_url (+3) |
| `backend/app/api/routes/bugs.py` | delete_bug, _attachment_counts, _bug_to_out, list_bugs, get_bug (+2) |
| `backend/app/api/routes/stories.py` | delete_story, _attachment_counts, _story_to_out, list_stories, get_story (+2) |
| `backend/app/api/routes/tasks.py` | delete_task, _attachment_counts, _task_to_out, list_tasks, get_task (+2) |

## Entry Points

Start here when exploring this area:

- **`delete_attachment`** (Function) — `backend/app/api/routes/attachments.py:186`
- **`delete_bug`** (Function) — `backend/app/api/routes/bugs.py:180`
- **`delete_comment`** (Function) — `backend/app/api/routes/comments.py:147`
- **`download_backup`** (Function) — `backend/app/api/routes/db_backups.py:133`
- **`delete_backup`** (Function) — `backend/app/api/routes/db_backups.py:166`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `delete_attachment` | Function | `backend/app/api/routes/attachments.py` | 186 |
| `delete_bug` | Function | `backend/app/api/routes/bugs.py` | 180 |
| `delete_comment` | Function | `backend/app/api/routes/comments.py` | 147 |
| `download_backup` | Function | `backend/app/api/routes/db_backups.py` | 133 |
| `delete_backup` | Function | `backend/app/api/routes/db_backups.py` | 166 |
| `delete_project` | Function | `backend/app/api/routes/projects.py` | 121 |
| `delete_story` | Function | `backend/app/api/routes/stories.py` | 177 |
| `delete_task` | Function | `backend/app/api/routes/tasks.py` | 187 |
| `update_user` | Function | `backend/app/api/routes/users.py` | 101 |
| `delete_user` | Function | `backend/app/api/routes/users.py` | 142 |
| `upload_my_avatar` | Function | `backend/app/api/routes/users.py` | 203 |
| `delete_my_avatar` | Function | `backend/app/api/routes/users.py` | 275 |
| `record_audit` | Function | `backend/app/core/audit.py` | 34 |
| `ai_status` | Function | `backend/app/api/routes/ai.py` | 43 |
| `test_ai_connection` | Function | `backend/app/api/routes/ai.py` | 180 |
| `summarize_entity` | Function | `backend/app/api/routes/ai.py` | 249 |
| `regenerate_one_section` | Function | `backend/app/api/routes/prd.py` | 551 |
| `load_runtime` | Function | `backend/app/core/ai.py` | 55 |
| `is_enabled` | Function | `backend/app/core/ai.py` | 88 |
| `chat_completion` | Function | `backend/app/core/ai.py` | 111 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Export_document → _esc` | intra_community | 5 |
| `Update_bug → _truncate` | cross_community | 4 |
| `Update_story → _truncate` | cross_community | 4 |
| `Update_task → _truncate` | cross_community | 4 |
| `Summarize_entity → Is_enabled` | intra_community | 4 |
| `Create_bug → _truncate` | cross_community | 4 |
| `Create_story → _truncate` | cross_community | 4 |
| `Create_task → _truncate` | cross_community | 4 |
| `Get_version → _run` | cross_community | 4 |
| `Get_version → _git_env` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_29 | 7 calls |
| Cluster_28 | 7 calls |
| App | 1 calls |

## How to Explore

1. `context({name: "delete_attachment"})` — see callers and callees
2. `query({search_query: "routes"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
