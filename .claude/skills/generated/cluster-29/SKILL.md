---
name: cluster-29
description: "Skill for the Cluster_29 area of SL_flow. 14 symbols across 1 files."
---

# Cluster_29

14 symbols | 1 files | Cohesion: 76%

## When to Use

- Working with code in `backend/`
- Understanding how is_h2, heading_matches, generate_full_prd work
- Modifying cluster_29-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/core/prd_generator.py` | _truncate, _build_section_skeleton, _max_tokens_for_template, _parse_priority, _coerce_str (+9) |

## Entry Points

Start here when exploring this area:

- **`is_h2`** (Function) — `backend/app/core/prd_generator.py:356`
- **`heading_matches`** (Function) — `backend/app/core/prd_generator.py:367`
- **`generate_full_prd`** (Function) — `backend/app/core/prd_generator.py:498`
- **`reextract_requirements`** (Function) — `backend/app/core/prd_generator.py:665`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `is_h2` | Function | `backend/app/core/prd_generator.py` | 356 |
| `heading_matches` | Function | `backend/app/core/prd_generator.py` | 367 |
| `generate_full_prd` | Function | `backend/app/core/prd_generator.py` | 498 |
| `reextract_requirements` | Function | `backend/app/core/prd_generator.py` | 665 |
| `_truncate` | Function | `backend/app/core/prd_generator.py` | 98 |
| `_build_section_skeleton` | Function | `backend/app/core/prd_generator.py` | 115 |
| `_max_tokens_for_template` | Function | `backend/app/core/prd_generator.py` | 156 |
| `_parse_priority` | Function | `backend/app/core/prd_generator.py` | 178 |
| `_coerce_str` | Function | `backend/app/core/prd_generator.py` | 198 |
| `_strip_thinking_blocks` | Function | `backend/app/core/prd_generator.py` | 234 |
| `_strip_code_fence` | Function | `backend/app/core/prd_generator.py` | 262 |
| `_extract_json` | Function | `backend/app/core/prd_generator.py` | 271 |
| `_ensure_markers` | Function | `backend/app/core/prd_generator.py` | 322 |
| `_build_user_prompt` | Function | `backend/app/core/prd_generator.py` | 474 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Generate_full_prd → _build_section_skeleton` | intra_community | 3 |
| `Generate_full_prd → _truncate` | intra_community | 3 |
| `Generate_full_prd → Is_enabled` | cross_community | 3 |
| `Reextract_requirements → Is_enabled` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Routes | 5 calls |

## How to Explore

1. `context({name: "is_h2"})` — see callers and callees
2. `query({search_query: "cluster_29"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
