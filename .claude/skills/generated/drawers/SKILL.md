---
name: drawers
description: "Skill for the Drawers area of SL_flow. 5 symbols across 5 files."
---

# Drawers

5 symbols | 5 files | Cohesion: 67%

## When to Use

- Working with code in `frontend/`
- Understanding how useUserOptions, CommentsPanel, BugDrawer work
- Modifying drawers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/hooks/options.ts` | useUserOptions |
| `frontend/src/components/CommentsPanel.tsx` | CommentsPanel |
| `frontend/src/components/drawers/BugDrawer.tsx` | BugDrawer |
| `frontend/src/components/drawers/StoryDrawer.tsx` | StoryDrawer |
| `frontend/src/components/drawers/TaskDrawer.tsx` | TaskDrawer |

## Entry Points

Start here when exploring this area:

- **`useUserOptions`** (Function) — `frontend/src/hooks/options.ts:12`
- **`CommentsPanel`** (Function) — `frontend/src/components/CommentsPanel.tsx:18`
- **`BugDrawer`** (Function) — `frontend/src/components/drawers/BugDrawer.tsx:52`
- **`StoryDrawer`** (Function) — `frontend/src/components/drawers/StoryDrawer.tsx:46`
- **`TaskDrawer`** (Function) — `frontend/src/components/drawers/TaskDrawer.tsx:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useUserOptions` | Function | `frontend/src/hooks/options.ts` | 12 |
| `CommentsPanel` | Function | `frontend/src/components/CommentsPanel.tsx` | 18 |
| `BugDrawer` | Function | `frontend/src/components/drawers/BugDrawer.tsx` | 52 |
| `StoryDrawer` | Function | `frontend/src/components/drawers/StoryDrawer.tsx` | 46 |
| `TaskDrawer` | Function | `frontend/src/components/drawers/TaskDrawer.tsx` | 49 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pages | 4 calls |

## How to Explore

1. `context({name: "useUserOptions"})` — see callers and callees
2. `query({search_query: "drawers"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
