import { http } from "./http";
import type {
  Attachment,
  AttachmentTargetType,
  AuditLogPage,
  AuditLogQuery,
  BackupSetting,
  BackupSettingUpdate,
  Bug,
  Comment,
  CommentTargetType,
  DashboardOverview,
  DBBackup,
  DBBackupPage,
  Project,
  RestoreResult,
  Story,
  SystemVersion,
  Task,
  Token,
  UpdateInfo,
  User,
} from "./types";

// --- Auth ----------------------------------------------------------------
export const auth = {
  login: (username: string, password: string) =>
    http.post<Token>("/auth/login-json", { username, password }).then((r) => r.data),
  me: () => http.get<User>("/auth/me").then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    http
      .post("/auth/change-password", { current_password, new_password })
      .then(() => true),
};

// --- Users ---------------------------------------------------------------
export const users = {
  list: () => http.get<User[]>("/users").then((r) => r.data),
  create: (data: Partial<User> & { password: string }) =>
    http.post<User>("/users", data).then((r) => r.data),
  update: (id: number, data: Partial<User>) =>
    http.patch<User>(`/users/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/users/${id}`).then(() => true),
  resetPassword: (id: number, new_password: string) =>
    http.post(`/users/${id}/reset-password`, { new_password }).then(() => true),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return http
      .post<User>("/users/me/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  removeAvatar: () => http.delete("/users/me/avatar").then(() => true),
};

// --- Projects ------------------------------------------------------------
export const projects = {
  list: (params?: { q?: string; status?: string }) =>
    http.get<Project[]>("/projects", { params }).then((r) => r.data),
  get: (id: number) => http.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: Partial<Project>) =>
    http.post<Project>("/projects", data).then((r) => r.data),
  update: (id: number, data: Partial<Project>) =>
    http.patch<Project>(`/projects/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/projects/${id}`).then(() => true),
};

// --- Stories -------------------------------------------------------------
export const stories = {
  list: (params?: Record<string, unknown>) =>
    http.get<Story[]>("/stories", { params }).then((r) => r.data),
  get: (id: number) => http.get<Story>(`/stories/${id}`).then((r) => r.data),
  create: (data: Partial<Story>) => http.post<Story>("/stories", data).then((r) => r.data),
  update: (id: number, data: Partial<Story>) =>
    http.patch<Story>(`/stories/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/stories/${id}`).then(() => true),
};

// --- Tasks ---------------------------------------------------------------
export const tasks = {
  list: (params?: Record<string, unknown>) =>
    http.get<Task[]>("/tasks", { params }).then((r) => r.data),
  get: (id: number) => http.get<Task>(`/tasks/${id}`).then((r) => r.data),
  create: (data: Partial<Task>) => http.post<Task>("/tasks", data).then((r) => r.data),
  update: (id: number, data: Partial<Task>) =>
    http.patch<Task>(`/tasks/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/tasks/${id}`).then(() => true),
};

// --- Bugs ----------------------------------------------------------------
export const bugs = {
  list: (params?: Record<string, unknown>) =>
    http.get<Bug[]>("/bugs", { params }).then((r) => r.data),
  get: (id: number) => http.get<Bug>(`/bugs/${id}`).then((r) => r.data),
  create: (data: Partial<Bug>) => http.post<Bug>("/bugs", data).then((r) => r.data),
  update: (id: number, data: Partial<Bug>) =>
    http.patch<Bug>(`/bugs/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/bugs/${id}`).then(() => true),
};

// --- Comments ------------------------------------------------------------
export const comments = {
  list: (target_type: CommentTargetType, target_id: number) =>
    http.get<Comment[]>("/comments", { params: { target_type, target_id } }).then((r) => r.data),
  create: (target_type: CommentTargetType, target_id: number, body: string) =>
    http.post<Comment>("/comments", { target_type, target_id, body }).then((r) => r.data),
  remove: (id: number) => http.delete(`/comments/${id}`).then(() => true),
};

// --- Attachments ---------------------------------------------------------
export const attachments = {
  list: (target_type: AttachmentTargetType, target_id: number) =>
    http
      .get<Attachment[]>("/attachments", { params: { target_type, target_id } })
      .then((r) => r.data),
  upload: (target_type: AttachmentTargetType, target_id: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    return http
      .post<Attachment[]>("/attachments", fd, {
        params: { target_type, target_id },
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  remove: (id: number) => http.delete(`/attachments/${id}`).then(() => true),
};

// --- Dashboard -----------------------------------------------------------
export const dashboard = {
  overview: () => http.get<DashboardOverview>("/dashboard/overview").then((r) => r.data),
};

// --- System --------------------------------------------------------------
export const system = {
  version: () => http.get<SystemVersion>("/system/version").then((r) => r.data),
  checkUpdate: () => http.post<UpdateInfo>("/system/check-update").then((r) => r.data),
  applyUpdate: () =>
    http
      .post<{ status: string; message: string }>("/system/apply-update")
      .then((r) => r.data),
  updateLog: () => http.get<{ log: string }>("/system/update-log").then((r) => r.data),
};

// --- Audit logs ----------------------------------------------------------
export const auditLogs = {
  list: (params?: AuditLogQuery) =>
    http.get<AuditLogPage>("/audit-logs", { params }).then((r) => r.data),
};

// --- DB Backups ----------------------------------------------------------
export const dbBackups = {
  list: (page = 1, page_size = 50) =>
    http
      .get<DBBackupPage>("/db-backups", { params: { page, page_size } })
      .then((r) => r.data),
  create: (note?: string) =>
    http.post<DBBackup>("/db-backups", { note }).then((r) => r.data),
  remove: (id: number) => http.delete(`/db-backups/${id}`).then(() => true),
  restore: (id: number) =>
    http.post<RestoreResult>(`/db-backups/${id}/restore`).then((r) => r.data),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return http
      .post<DBBackup>("/db-backups/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  // settings sit under /db-backups/settings (admin only)
  getSettings: () =>
    http.get<BackupSetting>("/db-backups/settings").then((r) => r.data),
  updateSettings: (data: BackupSettingUpdate) =>
    http.patch<BackupSetting>("/db-backups/settings", data).then((r) => r.data),
};
