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
