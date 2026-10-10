import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { configured, serverClient } from "./supabase/server";
import type {
  Profile,
  Project,
  Milestone,
  Submission,
  Decision,
  ProjectFile,
  Comment,
} from "./types";
export function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export const session = cache(async () => {
  if (!configured()) redirect("/login");
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const result = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  check(result.error);
  if (!result.data)
    throw new Error(
      "Your account profile is unavailable. Please contact Aiquor.",
    );
  return { db, user, profile: result.data as Profile };
});
export async function adminSession() {
  const s = await session();
  if (s.profile.role !== "admin") notFound();
  return s;
}
export async function projectData(id: string) {
  const s = await session();
  const result = await s.db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) notFound();
  const project = result.data as Project;
  const results = await Promise.all([
    s.db
      .from("milestones")
      .select("*")
      .eq("project_id", id)
      .order("created_at"),
    s.db
      .from("submissions")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    s.db
      .from("decisions")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    s.db
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    s.db.from("comments").select("*").eq("project_id", id).order("created_at"),
    s.db.from("clients").select("*").eq("id", project.client_id).single(),
  ]);
  results.forEach((r) => check(r.error));
  return {
    ...s,
    project,
    milestones: results[0].data as Milestone[],
    submissions: results[1].data as Submission[],
    decisions: results[2].data as Decision[],
    files: results[3].data as ProjectFile[],
    comments: results[4].data as Comment[],
    client: results[5].data as { name: string; company: string },
  };
}
