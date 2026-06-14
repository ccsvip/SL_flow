// Shared API types - kept in sync manually with backend Pydantic models.

export type UserRole = "admin" | "user";

export interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  avatar: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export interface APIKeyItem {
  id: number;
  title: string;
  api_key: string;
  api_key_masked: string | null;
  base_url: string | null;
  models: string[];
  notes: string | null;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface APIKeyCreateInput {
  title: string;
  api_key: string;
  base_url?: string | null;
  models?: string[];
  notes?: string | null;
}

export interface APIKeyUpdateInput {
  title?: string;
  api_key?: string;
  base_url?: string | null;
  models?: string[];
  notes?: string | null;
}

export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "archived";

export interface Project {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  start_date: string | null;
  end_date: string | null;
  owner: User | null;
  created_at: string;
  updated_at: string;
  story_count: number;
  task_count: number;
  bug_count: number;
}

export type StoryStatus = "draft" | "active" | "in_review" | "accepted" | "closed";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface Story {
  id: number;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  status: StoryStatus;
  priority: Priority;
  estimate_points: number;
  project_id: number;
  creator: User | null;
  assignee: User | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  estimate_hours: number;
  consumed_hours: number;
  due_date: string | null;
  project_id: number;
  story_id: number | null;
  creator: User | null;
  assignee: User | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export type BugStatus = "open" | "in_progress" | "resolved" | "closed" | "reopened";
export type BugSeverity = "trivial" | "minor" | "major" | "critical" | "blocker";

export interface Bug {
  id: number;
  title: string;
  description: string | null;
  steps_to_reproduce: string | null;
  expected_result: string | null;
  actual_result: string | null;
  status: BugStatus;
  severity: BugSeverity;
  priority: Priority;
  environment: string | null;
  project_id: number;
  creator: User | null;
  assignee: User | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export type CommentTargetType = "project" | "story" | "task" | "bug";
export type AttachmentTargetType = CommentTargetType | "comment";

export interface Comment {
  id: number;
  body: string;
  target_type: CommentTargetType;
  target_id: number;
  author: User;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  target_type: AttachmentTargetType;
  target_id: number;
  uploader: User | null;
  created_at: string;
  url: string;
  preview_url: string;
  is_image: boolean;
  is_video: boolean;
}

export interface DashboardOverview {
  counts: Record<string, number>;
  task_status_pie: { name: string; value: number }[];
  bug_status_pie: { name: string; value: number }[];
  story_status_pie: { name: string; value: number }[];
  trend: { date: string; tasks: number; bugs: number; stories: number }[];
  project_breakdown: {
    id: number;
    name: string;
    color: string;
    stories: number;
    tasks: number;
    bugs: number;
  }[];
  mine: { tasks: number; bugs: number; stories: number };
}

export interface SystemVersion {
  app_version: string;
  hot_reload_enabled: boolean;
  git: {
    available: boolean;
    branch?: string | null;
    local_commit?: string | null;
    local_message?: string;
    local_author?: string;
    local_date?: string;
    reason?: string;
  };
}

export interface UpdateInfo {
  available: boolean;
  path?: string;
  branch?: string | null;
  local_commit?: string | null;
  local_message?: string;
  local_author?: string;
  local_date?: string;
  remote_available?: boolean;
  remote_commit?: string;
  remote_message?: string;
  remote_author?: string;
  remote_date?: string;
  update_available?: boolean;
  incoming_commits?: string[];
  reason?: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login_failed"
  | "logout"
  | "password_change";

export type AuditTargetType =
  | "project"
  | "story"
  | "task"
  | "bug"
  | "comment"
  | "attachment"
  | "user"
  | "auth"
  | "db_backup"
  | "backup_setting"
  | "prd"
  | "managed_api_key";

export interface AuditActor {
  id: number;
  username: string;
}

export interface AuditLog {
  id: number;
  actor: AuditActor | null;
  actor_username_at_event: string | null;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: number | null;
  target_label: string | null;
  request_method: string | null;
  request_path: string | null;
  status_code: number | null;
  client_ip: string | null;
  extra: string | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditLogQuery {
  action?: AuditAction;
  target_type?: AuditTargetType;
  actor_id?: number;
  q?: string;
  start?: string;
  end?: string;
  page?: number;
  page_size?: number;
}

// Database backups -----------------------------------------------------------

export type BackupKind = "manual" | "scheduled" | "pre_restore";
export type BackupStatus = "success" | "failed" | "running";

export interface DBBackup {
  id: number;
  filename: string;
  size_bytes: number;
  sha256: string | null;
  kind: BackupKind;
  status: BackupStatus;
  note: string | null;
  error: string | null;
  creator: User | null;
  creator_username_at_event: string | null;
  created_at: string;
}

export interface DBBackupPage {
  items: DBBackup[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackupSetting {
  enabled: boolean;
  interval_hours: number;
  keep_count: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  updated_at: string;
}

export interface BackupSettingUpdate {
  enabled?: boolean;
  interval_hours?: number;
  keep_count?: number;
}

export interface RestoreResult {
  status: string;
  message: string;
  pre_restore_backup_id: number | null;
}

// Calendar -------------------------------------------------------------------

export type CalendarKind = "task" | "story" | "bug";

export interface CalendarEvent {
  kind: CalendarKind;
  id: number;
  title: string;
  /** ISO `YYYY-MM-DD` - the day this event anchors to. For tasks this is
   *  due_date; for stories/bugs it is the date portion of updated_at. */
  date: string;
  anchor: "due_date" | "updated_at";
  status: string;
  priority?: string;
  severity?: string;
  project_id: number;
  assignee: {
    id: number;
    username: string;
    full_name: string | null;
  } | null;
}

export interface CalendarResponse {
  start: string;
  end: string;
  events: CalendarEvent[];
}

// Notifications -------------------------------------------------------------

export type NotificationKind = "mention" | "assigned" | "status" | "comment";
export type NotificationTargetType = "project" | "story" | "task" | "bug";

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  target_type: NotificationTargetType;
  target_id: number;
  body: string;
  is_read: boolean;
  comment_id: number | null;
  extra: string | null;
  created_at: string;
  actor: { id: number; username: string; full_name: string | null } | null;
}

export interface NotificationsPage {
  items: NotificationItem[];
  total: number;
  unread: number;
  page: number;
  page_size: number;
}

// AI summary ---------------------------------------------------------------

export type AITargetType = "task" | "story" | "bug";

export interface AIStatus {
  enabled: boolean;
  model: string | null;
}

export interface AISummaryResponse {
  summary: string;
  target_type: AITargetType;
  target_id: number;
  title: string;
}

export interface AIConfig {
  enabled: boolean;
  base_url: string;
  model: string;
  timeout_seconds: number;
  max_input_chars: number;
  api_key_masked: string | null;
  api_key_present: boolean;
}

export interface AIConfigUpdate {
  enabled?: boolean;
  base_url?: string;
  /** Empty string clears the saved key; omit to keep it. */
  api_key?: string;
  model?: string;
  timeout_seconds?: number;
  max_input_chars?: number;
}

export interface AITestResult {
  ok: boolean;
  message: string;
  sample: string | null;
  model: string | null;
}

// PRD ----------------------------------------------------------------------

export type PRDTemplate =
  | "software_project"
  | "mini_program"
  | "app"
  | "admin_system"
  | "ai_app"
  | "digital_human"
  | "tob_delivery";

export type PRDSourceType =
  | "one_liner"
  | "chat_log"
  | "customer_feedback"
  | "manual";

export type PRDStatus = "draft" | "generating" | "ready" | "archived";

export type PRDPriority = "low" | "medium" | "high" | "urgent";

export interface PRDTemplateSection {
  slug: string;
  title: string;
  hint: string;
}

export interface PRDTemplateInfo {
  template: PRDTemplate;
  label: string;
  description: string;
  tone: string;
  sections: PRDTemplateSection[];
}

export interface PRDRequirement {
  id: number;
  document_id: number;
  order_index: number;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  priority: PRDPriority;
  category: string | null;
  tag: string | null;
  converted_story_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PRDDocumentSummary {
  id: number;
  title: string;
  template: PRDTemplate;
  source_type: PRDSourceType;
  status: PRDStatus;
  summary: string | null;
  suggested_project_name: string | null;
  suggested_project_code: string | null;
  project_id: number | null;
  creator: User | null;
  generated_model: string | null;
  last_generation_truncated: boolean;
  requirement_count: number;
  created_at: string;
  updated_at: string;
}

export interface PRDDocument extends PRDDocumentSummary {
  content: string;
  source_input: string | null;
  requirements: PRDRequirement[];
}

export interface PRDGenerateInput {
  template: PRDTemplate;
  source_type: PRDSourceType;
  source_input: string;
  title?: string;
  extra_instruction?: string;
  project_id?: number;
}

export interface PRDDocumentUpdate {
  title?: string;
  content?: string;
  summary?: string;
  suggested_project_name?: string;
  suggested_project_code?: string;
  project_id?: number | null;
  status?: PRDStatus;
}

export interface PRDSectionRegenerateResult {
  section_slug: string;
  new_section_body: string;
  new_content: string;
}

export interface PRDConvertResult {
  created_story_ids: number[];
  skipped_requirement_ids: number[];
}

export interface PRDRequirementUpdate {
  title?: string;
  description?: string;
  acceptance_criteria?: string;
  priority?: PRDPriority;
  category?: string;
  tag?: string;
  order_index?: number;
}

export interface PRDRequirementCreate {
  title: string;
  description?: string;
  acceptance_criteria?: string;
  priority?: PRDPriority;
  category?: string;
  tag?: string;
  order_index?: number;
}

// --- Ops dashboard -------------------------------------------------------
export interface OpsHostInfo {
  available: boolean;
  reason?: string;
  ncpu?: number | null;
  mem_total?: number | null;
  kernel?: string | null;
  os?: string | null;
  arch?: string | null;
  server_version?: string | null;
  containers?: number | null;
  containers_running?: number | null;
  containers_stopped?: number | null;
  images?: number | null;
  name?: string | null;
}
export interface OpsContainerState {
  name: string;
  image: string;
  state: string;
  status: string;
  created_at?: string;
  running_for?: string;
  ports?: string;
}
export interface OpsContainerStat {
  name: string;
  cpu_percent: number;
  mem_used: number;
  mem_limit: number;
  mem_percent: number;
  net_io?: string;
  block_io?: string;
  pids?: string | number;
}
export interface OpsTopTable {
  table: string;
  size_bytes: number;
  rows: number;
}
export interface OpsDatabase {
  name?: string;
  size_bytes?: number;
  version?: string;
  connections_active?: number;
  connections_max?: number;
  top_tables?: OpsTopTable[];
}
export interface OpsRecentAudit {
  id: number;
  action?: string | null;
  actor_id?: number | null;
  target_type?: string | null;
  target_id?: number | null;
  created_at?: string | null;
}
export interface OpsSecurity {
  users_total?: number;
  users_active?: number;
  users_admin?: number;
  audit_24h?: number;
  audit_7d?: number;
  failed_logins_24h?: number;
  recent_audit?: OpsRecentAudit[];
}
export interface OpsOverview {
  generated_at: string;
  elapsed_ms: number;
  host: OpsHostInfo;
  containers: OpsContainerState[];
  container_stats: OpsContainerStat[];
  database: OpsDatabase;
  security: OpsSecurity;
  compose_project: string;
}
