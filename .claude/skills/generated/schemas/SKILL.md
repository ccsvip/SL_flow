---
name: schemas
description: "Skill for the Schemas area of SL_flow. 19 symbols across 7 files."
---

# Schemas

19 symbols | 7 files | Cohesion: 100%

## When to Use

- Working with code in `backend/`
- Understanding how APIKeyBase, APIKeyCreate, BugBase work
- Modifying schemas-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/schemas/api_key.py` | _blank_to_none, strip_optional, strip_optional, APIKeyBase, APIKeyCreate |
| `backend/app/schemas/user.py` | UserBase, UserCreate, UserOut, UserMe |
| `backend/app/schemas/bug.py` | BugBase, BugCreate |
| `backend/app/schemas/prd.py` | PRDDocumentSummary, PRDDocumentOut |
| `backend/app/schemas/project.py` | ProjectBase, ProjectCreate |
| `backend/app/schemas/story.py` | StoryBase, StoryCreate |
| `backend/app/schemas/task.py` | TaskBase, TaskCreate |

## Entry Points

Start here when exploring this area:

- **`APIKeyBase`** (Class) — `backend/app/schemas/api_key.py:15`
- **`APIKeyCreate`** (Class) — `backend/app/schemas/api_key.py:46`
- **`BugBase`** (Class) — `backend/app/schemas/bug.py:11`
- **`BugCreate`** (Class) — `backend/app/schemas/bug.py:25`
- **`PRDDocumentSummary`** (Class) — `backend/app/schemas/prd.py:71`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `APIKeyBase` | Class | `backend/app/schemas/api_key.py` | 15 |
| `APIKeyCreate` | Class | `backend/app/schemas/api_key.py` | 46 |
| `BugBase` | Class | `backend/app/schemas/bug.py` | 11 |
| `BugCreate` | Class | `backend/app/schemas/bug.py` | 25 |
| `PRDDocumentSummary` | Class | `backend/app/schemas/prd.py` | 71 |
| `PRDDocumentOut` | Class | `backend/app/schemas/prd.py` | 93 |
| `ProjectBase` | Class | `backend/app/schemas/project.py` | 11 |
| `ProjectCreate` | Class | `backend/app/schemas/project.py` | 21 |
| `StoryBase` | Class | `backend/app/schemas/story.py` | 11 |
| `StoryCreate` | Class | `backend/app/schemas/story.py` | 22 |
| `TaskBase` | Class | `backend/app/schemas/task.py` | 11 |
| `TaskCreate` | Class | `backend/app/schemas/task.py` | 24 |
| `UserBase` | Class | `backend/app/schemas/user.py` | 10 |
| `UserCreate` | Class | `backend/app/schemas/user.py` | 18 |
| `UserOut` | Class | `backend/app/schemas/user.py` | 34 |
| `UserMe` | Class | `backend/app/schemas/user.py` | 69 |
| `strip_optional` | Method | `backend/app/schemas/api_key.py` | 29 |
| `strip_optional` | Method | `backend/app/schemas/api_key.py` | 66 |
| `_blank_to_none` | Function | `backend/app/schemas/api_key.py` | 8 |

## How to Explore

1. `context({name: "APIKeyBase"})` — see callers and callees
2. `query({search_query: "schemas"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
