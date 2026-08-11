---
name: api
description: "Skill for the Api area of SL_flow. 13 symbols across 3 files."
---

# Api

13 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `frontend/`
- Understanding how me, list, get work
- Modifying api-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/api/client.ts` | me, list, get, overview, unreadCount (+6) |
| `backend/app/api/deps.py` | get_current_user |
| `backend/app/core/security.py` | decode_token |

## Entry Points

Start here when exploring this area:

- **`me`** (Function) — `frontend/src/api/client.ts:51`
- **`list`** (Function) — `frontend/src/api/client.ts:60`
- **`get`** (Function) — `frontend/src/api/client.ts:83`
- **`overview`** (Function) — `frontend/src/api/client.ts:166`
- **`unreadCount`** (Function) — `frontend/src/api/client.ts:188`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `me` | Function | `frontend/src/api/client.ts` | 51 |
| `list` | Function | `frontend/src/api/client.ts` | 60 |
| `get` | Function | `frontend/src/api/client.ts` | 83 |
| `overview` | Function | `frontend/src/api/client.ts` | 166 |
| `unreadCount` | Function | `frontend/src/api/client.ts` | 188 |
| `status` | Function | `frontend/src/api/client.ts` | 202 |
| `getConfig` | Function | `frontend/src/api/client.ts` | 213 |
| `templates` | Function | `frontend/src/api/client.ts` | 222 |
| `version` | Function | `frontend/src/api/client.ts` | 306 |
| `updateLog` | Function | `frontend/src/api/client.ts` | 312 |
| `getSettings` | Function | `frontend/src/api/client.ts` | 342 |
| `get_current_user` | Function | `backend/app/api/deps.py` | 16 |
| `decode_token` | Function | `backend/app/core/security.py` | 37 |

## How to Explore

1. `context({name: "me"})` — see callers and callees
2. `query({search_query: "api"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
