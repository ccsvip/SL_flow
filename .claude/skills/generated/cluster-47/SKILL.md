---
name: cluster-47
description: "Skill for the Cluster_47 area of SL_flow. 4 symbols across 1 files."
---

# Cluster_47

4 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `frontend/`
- Understanding how App, bootstrap work
- Modifying cluster_47-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/App.tsx` | RequireAuth, RequireAdmin, App, bootstrap |

## Entry Points

Start here when exploring this area:

- **`App`** (Function) — `frontend/src/App.tsx:50`
- **`bootstrap`** (Function) — `frontend/src/App.tsx:51`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `App` | Function | `frontend/src/App.tsx` | 50 |
| `bootstrap` | Function | `frontend/src/App.tsx` | 51 |
| `RequireAuth` | Function | `frontend/src/App.tsx` | 26 |
| `RequireAdmin` | Function | `frontend/src/App.tsx` | 42 |

## How to Explore

1. `context({name: "App"})` — see callers and callees
2. `query({search_query: "cluster_47"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
