---
name: components
description: "Skill for the Components area of SL_flow. 30 symbols across 9 files."
---

# Components

30 symbols | 9 files | Cohesion: 93%

## When to Use

- Working with code in `frontend/`
- Understanding how AttachmentList, setStaged, handlePickFiles work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/components/MarkdownView.tsx` | escape, inline, stripMarkers, render, closeList (+3) |
| `frontend/src/components/AttachmentList.tsx` | AttachmentList, setStaged, handlePickFiles, handleRemove, onOk |
| `frontend/src/utils/format.ts` | bytes, initials, zh, colorOf |
| `frontend/src/components/AuthMedia.tsx` | strip, AuthImage, AuthVideo |
| `frontend/src/components/UserBadge.tsx` | fetchAvatar, useAvatarBlob, UserBadge |
| `frontend/src/pages/SettingsPage.tsx` | SettingsPage, validateAvatarFile, handleAvatarUpload |
| `frontend/src/layout/AppHeader.tsx` | useHeaderAvatar, AppHeader |
| `frontend/src/components/StatusTag.tsx` | StatusTag |
| `frontend/src/pages/UsersPage.tsx` | render |

## Entry Points

Start here when exploring this area:

- **`AttachmentList`** (Function) — `frontend/src/components/AttachmentList.tsx:32`
- **`setStaged`** (Function) — `frontend/src/components/AttachmentList.tsx:49`
- **`handlePickFiles`** (Function) — `frontend/src/components/AttachmentList.tsx:143`
- **`handleRemove`** (Function) — `frontend/src/components/AttachmentList.tsx:156`
- **`onOk`** (Function) — `frontend/src/components/AttachmentList.tsx:165`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AttachmentList` | Function | `frontend/src/components/AttachmentList.tsx` | 32 |
| `setStaged` | Function | `frontend/src/components/AttachmentList.tsx` | 49 |
| `handlePickFiles` | Function | `frontend/src/components/AttachmentList.tsx` | 143 |
| `handleRemove` | Function | `frontend/src/components/AttachmentList.tsx` | 156 |
| `onOk` | Function | `frontend/src/components/AttachmentList.tsx` | 165 |
| `AuthImage` | Function | `frontend/src/components/AuthMedia.tsx` | 15 |
| `AuthVideo` | Function | `frontend/src/components/AuthMedia.tsx` | 85 |
| `bytes` | Function | `frontend/src/utils/format.ts` | 15 |
| `UserBadge` | Function | `frontend/src/components/UserBadge.tsx` | 70 |
| `AppHeader` | Function | `frontend/src/layout/AppHeader.tsx` | 72 |
| `SettingsPage` | Function | `frontend/src/pages/SettingsPage.tsx` | 43 |
| `validateAvatarFile` | Function | `frontend/src/pages/SettingsPage.tsx` | 93 |
| `handleAvatarUpload` | Function | `frontend/src/pages/SettingsPage.tsx` | 103 |
| `initials` | Function | `frontend/src/utils/format.ts` | 22 |
| `html` | Function | `frontend/src/components/MarkdownView.tsx` | 218 |
| `StatusTag` | Function | `frontend/src/components/StatusTag.tsx` | 3 |
| `zh` | Function | `frontend/src/utils/format.ts` | 70 |
| `colorOf` | Function | `frontend/src/utils/format.ts` | 107 |
| `render` | Function | `frontend/src/pages/UsersPage.tsx` | 157 |
| `strip` | Function | `frontend/src/components/AuthMedia.tsx` | 6 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Html → Escape` | intra_community | 5 |
| `AttachmentList → Strip` | intra_community | 3 |
| `SettingsPage → ValidateAvatarFile` | intra_community | 3 |
| `SettingsPage → ExtractError` | cross_community | 3 |
| `UserBadge → FetchAvatar` | intra_community | 3 |
| `Html → StripMarkers` | intra_community | 3 |
| `Html → CloseList` | intra_community | 3 |
| `Html → CloseQuote` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pages | 3 calls |

## How to Explore

1. `context({name: "AttachmentList"})` — see callers and callees
2. `query({search_query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
