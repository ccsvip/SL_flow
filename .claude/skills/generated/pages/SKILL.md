---
name: pages
description: "Skill for the Pages area of SL_flow. 90 symbols across 30 files."
---

# Pages

90 symbols | 30 files | Cohesion: 84%

## When to Use

- Working with code in `frontend/`
- Understanding how extractError, AISummaryButton, onError work
- Modifying pages-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/pages/APIKeysPage.tsx` | onError, maskKey, DetailRow, APIKeysPage, copyText (+7) |
| `frontend/src/pages/OpsPage.tsx` | StatCard, InfoRow, OpsPage, HostSection, ContainerSection (+6) |
| `frontend/src/pages/PRDDetailPage.tsx` | onError, downloadExport, onClick, stripSectionMarkers, RegenSectionDialog (+4) |
| `frontend/src/pages/BackupsPage.tsx` | onError, BackupsPage, downloadBackup, handleUpload, handleRestore (+1) |
| `frontend/src/pages/PRDListPage.tsx` | onError, PRDWizard, renderTemplateGallery, PRDListPage, render |
| `frontend/src/pages/NotificationsPage.tsx` | onError, deepLinkOf, NotificationsPage, handleClick |
| `frontend/src/pages/ProjectsPage.tsx` | submit, onError, ProjectFormModal, ProjectsPage |
| `frontend/src/pages/UsersPage.tsx` | submit, onError, UserFormModal, UsersPage |
| `frontend/src/pages/AISettingsPage.tsx` | onError, applyPreset, onClick |
| `frontend/src/pages/CalendarPage.tsx` | CalendarPage, cellRender, openEvent |

## Entry Points

Start here when exploring this area:

- **`extractError`** (Function) — `frontend/src/api/http.ts:39`
- **`AISummaryButton`** (Function) — `frontend/src/components/AISummaryButton.tsx:35`
- **`onError`** (Function) — `frontend/src/components/AISummaryButton.tsx:50`
- **`onError`** (Function) — `frontend/src/components/AttachmentList.tsx:65`
- **`onError`** (Function) — `frontend/src/components/CommentsPanel.tsx:56`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `extractError` | Function | `frontend/src/api/http.ts` | 39 |
| `AISummaryButton` | Function | `frontend/src/components/AISummaryButton.tsx` | 35 |
| `onError` | Function | `frontend/src/components/AISummaryButton.tsx` | 50 |
| `onError` | Function | `frontend/src/components/AttachmentList.tsx` | 65 |
| `onError` | Function | `frontend/src/components/CommentsPanel.tsx` | 56 |
| `onError` | Function | `frontend/src/components/drawers/BugDrawer.tsx` | 101 |
| `onError` | Function | `frontend/src/components/drawers/StoryDrawer.tsx` | 95 |
| `onError` | Function | `frontend/src/components/drawers/TaskDrawer.tsx` | 110 |
| `logout` | Function | `frontend/src/components/modals/ChangePasswordModal.tsx` | 14 |
| `submit` | Function | `frontend/src/components/modals/ChangePasswordModal.tsx` | 16 |
| `onError` | Function | `frontend/src/components/modals/UpdateModal.tsx` | 28 |
| `onError` | Function | `frontend/src/pages/AISettingsPage.tsx` | 153 |
| `onError` | Function | `frontend/src/pages/APIKeysPage.tsx` | 149 |
| `onError` | Function | `frontend/src/pages/BackupsPage.tsx` | 77 |
| `setAuth` | Function | `frontend/src/pages/LoginPage.tsx` | 37 |
| `onFinish` | Function | `frontend/src/pages/LoginPage.tsx` | 46 |
| `onError` | Function | `frontend/src/pages/NotificationsPage.tsx` | 79 |
| `downloadExport` | Function | `frontend/src/pages/PRDDetailPage.tsx` | 614 |
| `onClick` | Function | `frontend/src/pages/PRDDetailPage.tsx` | 718 |
| `onError` | Function | `frontend/src/pages/ProjectsPage.tsx` | 183 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Render → ExtractError` | cross_community | 3 |
| `OpsPage → StatCard` | intra_community | 3 |
| `OpsPage → Bytes` | cross_community | 3 |
| `OpsPage → InfoRow` | intra_community | 3 |
| `OpsPage → UsageColor` | cross_community | 3 |
| `BackupsPage → ExtractError` | cross_community | 3 |
| `NotificationsPage → DeepLinkOf` | intra_community | 3 |
| `SettingsPage → ExtractError` | cross_community | 3 |
| `OnClick → ExtractError` | intra_community | 3 |
| `APIKeysPage → MaskKey` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Components | 1 calls |

## How to Explore

1. `context({name: "extractError"})` — see callers and callees
2. `query({search_query: "pages"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
