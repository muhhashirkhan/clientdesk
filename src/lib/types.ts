export type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "client";
};
export type Client = {
  id: string;
  name: string;
  email: string;
  company: string;
  created_at: string;
};
export type Project = {
  id: string;
  client_id: string;
  name: string;
  scope: string;
  status: "draft" | "active" | "on_hold" | "completed";
  deadline: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};
export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: "planned" | "in_review" | "changes_requested" | "approved";
  created_at: string;
};
export type Submission = {
  id: string;
  milestone_id: string;
  project_id: string;
  notes: string;
  preview_url: string;
  author_name: string;
  created_at: string;
  status: "pending" | "approved" | "changes_requested";
};
export type Decision = {
  id: string;
  submission_id: string;
  project_id: string;
  decision: string;
  feedback: string;
  actor_name: string;
  created_at: string;
};
export type ProjectFile = {
  id: string;
  project_id: string;
  original_name: string;
  storage_path: string;
  size: number;
  mime_type: string;
  uploaded_by: string;
  author_name: string;
  created_at: string;
};
export type Comment = {
  id: string;
  project_id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  created_at: string;
};
export type Notice = {
  id: string;
  project_id: string;
  message: string;
  kind: string;
  read_at: string | null;
  created_at: string;
};
export type Invitation = {
  id: string;
  client_id: string;
  email: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  email_sent_at: string | null;
};
export type ActionResult = {
  ok: boolean;
  message: string;
  redirectTo?: string;
};
export type Action = (
  previous: ActionResult,
  form: FormData,
) => Promise<ActionResult>;
