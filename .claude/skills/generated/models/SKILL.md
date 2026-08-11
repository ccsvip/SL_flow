---
name: models
description: "Skill for the Models area of SL_flow. 17 symbols across 15 files."
---

# Models

17 symbols | 15 files | Cohesion: 100%

## When to Use

- Working with code in `backend/`
- Understanding how Base, TimestampMixin, AISetting work
- Modifying models-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/models/db_backup.py` | DBBackup, BackupSetting |
| `backend/app/models/prd.py` | PRDDocument, PRDRequirement |
| `backend/app/core/db.py` | Base |
| `backend/app/models/_mixins.py` | TimestampMixin |
| `backend/app/models/ai_setting.py` | AISetting |
| `backend/app/models/api_key.py` | APIKey |
| `backend/app/models/attachment.py` | Attachment |
| `backend/app/models/audit_log.py` | AuditLog |
| `backend/app/models/bug.py` | Bug |
| `backend/app/models/comment.py` | Comment |

## Entry Points

Start here when exploring this area:

- **`Base`** (Class) — `backend/app/core/db.py:10`
- **`TimestampMixin`** (Class) — `backend/app/models/_mixins.py:7`
- **`AISetting`** (Class) — `backend/app/models/ai_setting.py:11`
- **`APIKey`** (Class) — `backend/app/models/api_key.py:11`
- **`Attachment`** (Class) — `backend/app/models/attachment.py:19`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Base` | Class | `backend/app/core/db.py` | 10 |
| `TimestampMixin` | Class | `backend/app/models/_mixins.py` | 7 |
| `AISetting` | Class | `backend/app/models/ai_setting.py` | 11 |
| `APIKey` | Class | `backend/app/models/api_key.py` | 11 |
| `Attachment` | Class | `backend/app/models/attachment.py` | 19 |
| `AuditLog` | Class | `backend/app/models/audit_log.py` | 42 |
| `Bug` | Class | `backend/app/models/bug.py` | 35 |
| `Comment` | Class | `backend/app/models/comment.py` | 18 |
| `DBBackup` | Class | `backend/app/models/db_backup.py` | 24 |
| `BackupSetting` | Class | `backend/app/models/db_backup.py` | 57 |
| `Notification` | Class | `backend/app/models/notification.py` | 36 |
| `PRDDocument` | Class | `backend/app/models/prd.py` | 58 |
| `PRDRequirement` | Class | `backend/app/models/prd.py` | 120 |
| `Project` | Class | `backend/app/models/project.py` | 21 |
| `Story` | Class | `backend/app/models/story.py` | 27 |
| `Task` | Class | `backend/app/models/task.py` | 28 |
| `User` | Class | `backend/app/models/user.py` | 17 |

## How to Explore

1. `context({name: "Base"})` — see callers and callees
2. `query({search_query: "models"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
