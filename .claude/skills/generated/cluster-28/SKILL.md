---
name: cluster-28
description: "Skill for the Cluster_28 area of SL_flow. 4 symbols across 1 files."
---

# Cluster_28

4 symbols | 1 files | Cohesion: 53%

## When to Use

- Working with code in `backend/`
- Understanding how notify_status_changed, notify_comment work
- Modifying cluster_28-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/core/notify.py` | _truncate, _emit, notify_status_changed, notify_comment |

## Entry Points

Start here when exploring this area:

- **`notify_status_changed`** (Function) — `backend/app/core/notify.py:160`
- **`notify_comment`** (Function) — `backend/app/core/notify.py:186`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `notify_status_changed` | Function | `backend/app/core/notify.py` | 160 |
| `notify_comment` | Function | `backend/app/core/notify.py` | 186 |
| `_truncate` | Function | `backend/app/core/notify.py` | 68 |
| `_emit` | Function | `backend/app/core/notify.py` | 75 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Update_bug → _truncate` | cross_community | 4 |
| `Update_story → _truncate` | cross_community | 4 |
| `Update_task → _truncate` | cross_community | 4 |
| `Create_bug → _truncate` | cross_community | 4 |
| `Create_story → _truncate` | cross_community | 4 |
| `Create_task → _truncate` | cross_community | 4 |
| `Notify_mentions → _truncate` | cross_community | 3 |
| `Notify_comment → _truncate` | intra_community | 3 |

## How to Explore

1. `context({name: "notify_status_changed"})` — see callers and callees
2. `query({search_query: "cluster_28"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
