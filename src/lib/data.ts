import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { configured, serverClient } from "./supabase/server";
import { readAllRows } from "./read-all";
import { uuid } from "./validation";
import type {
  Profile,
  Company,
  CompanyMember,
  WorkspaceRole,
  Project,
  Milestone,
  Submission,
  Decision,
  ProjectFile,
  Comment,
  ProjectTask,
} from "./types";

export function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  throw new Error("Workspace data could not be loaded. Please try again.");
}

export const session = cache(async () => {
  if (!configured()) redirect("/login");
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");

  const [profileRes, companiesRes, membershipsRes] = await Promise.all([
    db.from("profiles").select("*").eq("id", user.id).single(),
    db.from("companies").select("*").order("created_at"),
    db.from("company_members").select("*").eq("user_id", user.id),
  ]);
  check(profileRes.error);
  if (!profileRes.data)
    throw new Error(
      "Your account profile is unavailable. Please contact Aiquor.",
    );

  const rawProfile = profileRes.data as Profile;
  const companies = (companiesRes.data ?? []) as Company[];
  const memberships = (membershipsRes.data ?? []) as CompanyMember[];

  const activeCompany =
    companies.find((c) => c.id === rawProfile.active_company_id) ??
    companies[0] ??
    null;

  const activeMembership = activeCompany
    ? memberships.find((m) => m.company_id === activeCompany.id)
    : undefined;

  const workspaceRole: WorkspaceRole = activeMembership
    ? activeMembership.role
    : rawProfile.role === "admin"
      ? "owner"
      : "client";

  const effectiveRole: "admin" | "client" =
    activeMembership || rawProfile.role === "admin" ? "admin" : "client";

  const profile: Profile = {
    ...rawProfile,
    role: effectiveRole,
    active_company_id: activeCompany?.id ?? rawProfile.active_company_id ?? null,
  };

  return {
    db,
    user,
    profile,
    company: activeCompany,
    companies,
    memberships,
    workspaceRole,
    isOwnerOrAdmin: workspaceRole === "owner" || workspaceRole === "admin",
  };
});

export async function adminSession() {
  const s = await session();
  if (s.profile.role !== "admin") notFound();
  return s;
}

export async function projectData(id: string) {
  if (!uuid.safeParse(id).success) notFound();
  const s = await session();
  const result = await s.db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(result.error);
  if (!result.data) notFound();
  const project = result.data as Project;

  const results = await Promise.all([
    readAllRows<Milestone>((from, to) =>
      s.db
        .from("milestones")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    readAllRows<Submission>((from, to) =>
      s.db
        .from("submissions")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAllRows<Decision>((from, to) =>
      s.db
        .from("decisions")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAllRows<ProjectFile>((from, to) =>
      s.db
        .from("project_files")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAllRows<Comment>((from, to) =>
      s.db
        .from("comments")
        .select("*")
        .eq("project_id", id)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    s.db.from("clients").select("*").eq("id", project.client_id).single(),
    readAllRows<ProjectTask>((from, to) =>
      s.db
        .from("project_tasks")
        .select("*")
        .eq("project_id", id)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    project.company_id
      ? s.db
          .from("company_members")
          .select("company_id,user_id,role,joined_at")
          .eq("company_id", project.company_id)
          .order("joined_at")
      : Promise.resolve({ data: [], error: null }),
  ]);

  results.slice(0, 6).forEach((r) => check(r.error));

  const rawMembers = (results[7].data ?? []) as CompanyMember[];
  const memberIds = rawMembers.map((m) => m.user_id);
  const memberProfilesRes = memberIds.length
    ? await s.db.from("profiles").select("id,full_name").in("id", memberIds)
    : { data: [], error: null };
  const memberProfiles = (memberProfilesRes.data ?? []) as {
    id: string;
    full_name: string;
  }[];

  const teamMembers = rawMembers.map((m) => ({
    ...m,
    full_name:
      memberProfiles.find((p) => p.id === m.user_id)?.full_name ||
      "Team member",
  }));

  return {
    ...s,
    project,
    milestones: results[0].data as Milestone[],
    submissions: results[1].data as Submission[],
    decisions: results[2].data as Decision[],
    files: results[3].data as ProjectFile[],
    comments: results[4].data as Comment[],
    client: results[5].data as { name: string; company: string },
    tasks: (results[6].data ?? []) as ProjectTask[],
    teamMembers,
  };
}
