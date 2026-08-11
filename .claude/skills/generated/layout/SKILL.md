---
name: layout
description: "Skill for the Layout area of SL_flow. 3 symbols across 1 files."
---

# Layout

3 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `frontend/`
- Understanding how setMode, setAccent, onClick work
- Modifying layout-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/layout/AppHeader.tsx` | setMode, setAccent, onClick |

## Entry Points

Start here when exploring this area:

- **`setMode`** (Function) — `frontend/src/layout/AppHeader.tsx:77`
- **`setAccent`** (Function) — `frontend/src/layout/AppHeader.tsx:79`
- **`onClick`** (Function) — `frontend/src/layout/AppHeader.tsx:159`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `setMode` | Function | `frontend/src/layout/AppHeader.tsx` | 77 |
| `setAccent` | Function | `frontend/src/layout/AppHeader.tsx` | 79 |
| `onClick` | Function | `frontend/src/layout/AppHeader.tsx` | 159 |

## How to Explore

1. `context({name: "setMode"})` — see callers and callees
2. `query({search_query: "layout"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
