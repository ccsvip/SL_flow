---
name: app
description: "Skill for the App area of SL_flow. 5 symbols across 2 files."
---

# App

5 symbols | 2 files | Cohesion: 89%

## When to Use

- Working with code in `backend/`
- Understanding how reschedule, start_scheduler, shutdown_scheduler work
- Modifying app-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/core/scheduler.py` | _get_or_create_setting, reschedule, start_scheduler, shutdown_scheduler |
| `backend/app/main.py` | lifespan |

## Entry Points

Start here when exploring this area:

- **`reschedule`** (Function) — `backend/app/core/scheduler.py:132`
- **`start_scheduler`** (Function) — `backend/app/core/scheduler.py:165`
- **`shutdown_scheduler`** (Function) — `backend/app/core/scheduler.py:174`
- **`lifespan`** (Function) — `backend/app/main.py:37`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `reschedule` | Function | `backend/app/core/scheduler.py` | 132 |
| `start_scheduler` | Function | `backend/app/core/scheduler.py` | 165 |
| `shutdown_scheduler` | Function | `backend/app/core/scheduler.py` | 174 |
| `lifespan` | Function | `backend/app/main.py` | 37 |
| `_get_or_create_setting` | Function | `backend/app/core/scheduler.py` | 40 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Lifespan → _get_or_create_setting` | intra_community | 4 |
| `Update_settings → _get_or_create_setting` | cross_community | 3 |

## How to Explore

1. `context({name: "reschedule"})` — see callers and callees
2. `query({search_query: "app"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
