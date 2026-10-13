export type CompanyRole = "owner" | "admin" | "member";
export type WorkspaceRole = CompanyRole | "client";

export type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "client";
  active_company_id?: string | null;
  email_notifications?: boolean;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  support_email: string;
  website: string;
  brand_color: string;
  primary_color?: string;
  logo_url?: string;
  plan_id?: "free" | "pro" | "business";
  onboarding_completed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyMember = {
  company_id: string;
  user_id: string;
  role: CompanyRole;
  joined_at: string;
  full_name?: string;
  email?: string;
};

export type CompanyInvitation = {
  id: string;
  company_id: string;
  email: string;
  role: "admin" | "member";
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  accepted_by: string | null;
};

export type SubscriptionPlan = {
  id: "free" | "pro" | "business";
  name: string;
  description: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  max_projects: number;
  max_team_members: number;
  max_clients: number;
  max_storage_mb: number;
  features: string[];
};

export type CompanySubscription = {
  company_id: string;
  plan_id: "free" | "pro" | "business";
  status: "trialing" | "active" | "past_due" | "canceled";
  billing_cycle: "monthly" | "yearly";
  billing_email: string;
  current_period_start: string;
  current_period_end: string;
  updated_at: string;
};

export type ProjectTask = {
  id: string;
  company_id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  assignee_id: string | null;
  assignee_name: string;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  company_id?: string;
  name: string;
  email: string;
  company: string;
  created_at: string;
};

export type Project = {
  id: string;
  company_id?: string;
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
  company_id?: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: "planned" | "in_review" | "changes_requested" | "approved";
  created_at: string;
};

export type Submission = {
  id: string;
  company_id?: string;
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
  company_id?: string;
  submission_id: string;
  project_id: string;
  decision: string;
  feedback: string;
  actor_name: string;
  created_at: string;
};

export type ProjectFile = {
  id: string;
  company_id?: string;
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
  company_id?: string;
  project_id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  created_at: string;
};

export type Notice = {
  id: string;
  company_id?: string;
  project_id: string | null;
  message: string;
  kind: string;
  read_at: string | null;
  created_at: string;
};

export type Invitation = {
  id: string;
  company_id?: string;
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
