"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
import { adminClient, appUrl } from "@/lib/supabase/admin";
import {
  email,
  name,
  password,
  uuid,
  optionalDate,
  previewUrl,
  input,
} from "@/lib/validation";
import { safeNext } from "@/lib/utils";
import type { ActionResult, Profile } from "@/lib/types";

const saved = (message: string, redirectTo?: string): ActionResult => ({
  ok: true,
  message,
  redirectTo,
});
function must(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST116") {
    throw new Error(
      "The record was not changed. It may no longer be available.",
    );
  }
  if (/row-level security|permission denied/i.test(error.message)) {
    throw new Error(
      "You don’t have permission to modify this record, or the project is read-only.",
    );
  }
  if (
    /violates foreign key|violates check constraint|invalid input syntax|PGRST|schema cache/i.test(
      error.message,
    )
  ) {
    throw new Error("The change could not be saved. Please check your input and try again.");
  }
  throw new Error(error.message);
}
async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "The change could not be saved. Please try again.",
    };
  }
}
async function account(admin = false) {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Please sign in again.");
  const result = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  must(result.error);
  const profile = result.data as Profile;
  if (admin && profile.role !== "admin")
    throw new Error("Only the Aiquor team can do this.");
  return { db, user, profile };
}
function refresh() {
  revalidatePath("/", "layout");
}
async function changed(
  query: PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
) {
  const result = await query;
  if (result.error?.code === "PGRST116") {
    throw new Error(
      "The record was not changed. It may no longer be available.",
    );
  }
  must(result.error);
  if (!result.data)
    throw new Error(
      "The record was not changed. It may no longer be available.",
    );
  refresh();
}

export async function signIn(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        email,
        password: z.string().min(1),
        next: z.string().optional(),
      })
      .parse(input(form));
    const db = await serverClient();
    const { error } = await db.auth.signInWithPassword({
      email: v.email,
      password: v.password,
    });
    if (error)
      throw new Error(
        "Sign-in failed. Check your email and password, or reset your password.",
      );
    refresh();
    return saved("Signed in.", safeNext(v.next ?? null));
  });
}
export async function signOut(_: ActionResult, form: FormData) {
  void form;
  return run(async () => {
    const db = await serverClient();
    const { error } = await db.auth.signOut();
    must(error);
    refresh();
    return saved("Signed out.", "/login");
  });
}
export async function forgotPassword(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = email.parse(form.get("email"));
    const db = await serverClient();
    const { error } = await db.auth.resetPasswordForEmail(v, {
      redirectTo: appUrl() + "/auth/callback?next=%2Freset-password",
    });
    must(error);
    return saved(
      "If this email has an account, a password-reset link will arrive shortly. Check your spam folder too.",
    );
  });
}
export async function updatePassword(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({ password, confirm: z.string() })
      .refine((v) => v.password === v.confirm, {
        message: "Passwords do not match.",
      })
      .parse(input(form));
    const { db } = await account();
    const { error } = await db.auth.updateUser({ password: v.password });
    must(error);
    return saved("Password updated.", "/dashboard");
  });
}
export async function acceptInvitation(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        invitation: uuid,
        full_name: name,
        password,
        confirm: z.string(),
      })
      .refine((v) => v.password === v.confirm, {
        message: "Passwords do not match.",
      })
      .parse(input(form));
    const { db } = await account();
    // Membership is granted only by the database after checking the signed-in, verified email.
    const result = await db.rpc("accept_invitation", {
      invitation: v.invitation,
    });
    must(result.error);
    const auth = await db.auth.updateUser({ password: v.password });
    if (auth.error)
      throw new Error(
        "Invitation accepted, but your password was not updated: " +
          auth.error.message,
      );
    await changed(
      db
        .from("profiles")
        .update({ full_name: v.full_name })
        .eq("id", (await db.auth.getUser()).data.user!.id)
        .select("id")
        .single(),
    );
    return saved("Your account is ready.", "/dashboard");
  });
}
export async function createClientRecord(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({ name, email, company: z.string().trim().max(160) })
      .parse(input(form));
    const { db } = await account(true);
    const result = await db.from("clients").insert(v).select("id").single();
    if (result.error?.code === "23505")
      throw new Error("A client with this email already exists.");
    must(result.error);
    refresh();
    return saved(
      "Client saved. You can now create their project and invite them.",
    );
  });
}
export async function inviteClient(_: ActionResult, form: FormData) {
  return run(async () => {
    const clientId = uuid.parse(form.get("client_id"));
    const { db, user } = await account(true);
    const origin = appUrl();
    const client = await db
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    must(client.error);
    const latest = await db
      .from("invitations")
      .select("*")
      .eq("client_id", clientId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    must(latest.error);
    let invitation = latest.data;
    if (!invitation) {
      const result = await db
        .from("invitations")
        .insert({
          client_id: clientId,
          email: client.data.email,
          invited_by: user.id,
        })
        .select("*")
        .single();
      must(result.error);
      invitation = result.data;
    }
    const next = "/accept-invitation?invitation=" + invitation.id;
    const redirectTo =
      origin + "/auth/callback?next=" + encodeURIComponent(next);
    const admin = adminClient();
    const sent = await admin.auth.admin.inviteUserByEmail(client.data.email, {
      redirectTo,
    });
    if (sent.error) {
      if (
        ["email_exists", "user_already_exists"].includes(
          sent.error.code ?? "",
        ) ||
        /already.*registered|already.*exists/i.test(sent.error.message)
      ) {
        const mail = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, flowType: "implicit" } },
        );
        const retry = await mail.auth.signInWithOtp({
          email: client.data.email,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        });
        must(retry.error);
      } else
        throw new Error(
          "The invitation is saved, but email delivery failed: " +
            sent.error.message,
        );
    }
    await changed(
      db
        .from("invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .select("id")
        .single(),
    );
    return saved("Invitation email requested for " + client.data.email + ".");
  });
}
export async function revokeInvitation(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("invitation"));
    const { db } = await account(true);
    await changed(
      db
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("accepted_at", null)
        .select("id")
        .single(),
    );
    return saved("Invitation revoked.");
  });
}
export async function removeAccess(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z.object({ client_id: uuid, user_id: uuid }).parse(input(form));
    const { db } = await account(true);
    await changed(
      db
        .from("client_members")
        .delete()
        .eq("client_id", v.client_id)
        .eq("user_id", v.user_id)
        .select("user_id")
        .single(),
    );
    return saved("Client access removed.");
  });
}
const projectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  client_id: uuid,
  scope: z.string().trim().max(12000),
  deadline: optionalDate,
  status: z.enum(["draft", "active", "on_hold", "completed"]),
});
export async function createProject(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = projectSchema.parse(input(form));
    const { db } = await account(true);
    const result = await db.from("projects").insert(v).select("id").single();
    must(result.error);
    if (!result.data) throw new Error("Project was not saved.");
    refresh();
    return saved("Project created.", "/projects/" + result.data.id);
  });
}
export async function updateProject(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const v = projectSchema.parse(input(form));
    const { db } = await account(true);
    const current = await db
      .from("projects")
      .select("archived")
      .eq("id", id)
      .maybeSingle();
    must(current.error);
    if (!current.data)
      throw new Error(
        "The record was not changed. It may no longer be available.",
      );
    if (current.data.archived)
      throw new Error(
        "Restore this archived project before editing its details.",
      );
    await changed(
      db.from("projects").update(v).eq("id", id).select("id").single(),
    );
    return saved("Project updated.");
  });
}
export async function archiveProject(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const archived = form.get("archived") === "true";
    const { db } = await account(true);
    await changed(
      db
        .from("projects")
        .update({ archived })
        .eq("id", id)
        .select("id")
        .single(),
    );
    return saved(
      archived ? "Project archived. It is now read-only." : "Project restored.",
    );
  });
}
const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(8000),
  due_date: optionalDate,
});
export async function addMilestone(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = milestoneSchema.parse(input(form));
    const project_id = uuid.parse(form.get("project_id"));
    const { db } = await account(true);
    await changed(
      db
        .from("milestones")
        .insert({ ...v, project_id })
        .select("id")
        .single(),
    );
    return saved("Milestone added.");
  });
}
export async function editMilestone(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = milestoneSchema.parse(input(form));
    const id = uuid.parse(form.get("id"));
    const { db } = await account(true);
    await changed(
      db.from("milestones").update(v).eq("id", id).select("id").single(),
    );
    return saved("Milestone updated.");
  });
}
export async function submitMilestone(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        milestone: uuid,
        notes: z
          .string()
          .trim()
          .min(1, "Describe what is ready for review.")
          .max(8000),
        preview_url: previewUrl,
      })
      .parse(input(form));
    const { db } = await account(true);
    const result = await db.rpc("submit_milestone", {
      milestone: v.milestone,
      work_notes: v.notes,
      work_url: v.preview_url,
    });
    must(result.error);
    refresh();
    return saved("Work submitted. The client can now review it.");
  });
}
export async function decideSubmission(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        submission: uuid,
        choice: z.enum(["approved", "changes_requested"]),
        feedback: z.string().trim().max(8000),
      })
      .parse(input(form));
    if (v.choice === "changes_requested" && !v.feedback)
      throw new Error("Describe the changes you need.");
    const { db } = await account();
    const result = await db.rpc("decide_submission", {
      submission: v.submission,
      choice: v.choice,
      response: v.feedback,
    });
    must(result.error);
    refresh();
    return saved(
      v.choice === "approved"
        ? "Approval saved with your name and timestamp."
        : "Change request saved. Aiquor has been notified.",
    );
  });
}
export async function postComment(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        project_id: uuid,
        body: z.string().trim().min(1, "Write a message first.").max(8000),
        parent_id: z.union([uuid, z.literal("")]),
      })
      .parse(input(form));
    const { db } = await account();
    await changed(
      db
        .from("comments")
        .insert({ ...v, parent_id: v.parent_id || null })
        .select("id")
        .single(),
    );
    return saved("Comment posted.");
  });
}
export async function deleteFile(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const { db, user, profile } = await account();
    const file = await db
      .from("project_files")
      .select("id,project_id,storage_path,uploaded_by")
      .eq("id", id)
      .maybeSingle();
    must(file.error);
    if (!file.data) throw new Error("File not found.");
    if (file.data.uploaded_by !== user.id && profile.role !== "admin")
      throw new Error("You can only delete files you uploaded.");
    const proj = await db
      .from("projects")
      .select("archived,status")
      .eq("id", file.data.project_id)
      .maybeSingle();
    must(proj.error);
    if (!proj.data || proj.data.archived || proj.data.status === "completed")
      throw new Error("This project is read-only.");
    const removed = await db.storage
      .from("project-files")
      .remove([file.data.storage_path]);
    must(removed.error);
    await changed(
      db.from("project_files").delete().eq("id", id).select("id").single(),
    );
    return saved("File deleted.");
  });
}
export async function markRead(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const { db } = await account();
    await changed(
      db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .single(),
    );
    return saved("Marked as read.");
  });
}
export async function markAllRead(_: ActionResult, form: FormData) {
  void form;
  return run(async () => {
    const { db, user } = await account();
    const result = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    must(result.error);
    refresh();
    return saved("All notifications marked as read.");
  });
}
export async function saveProfile(_: ActionResult, form: FormData) {
  return run(async () => {
    const full_name = name.parse(form.get("full_name"));
    const { db, user } = await account();
    await changed(
      db
        .from("profiles")
        .update({ full_name })
        .eq("id", user.id)
        .select("id")
        .single(),
    );
    return saved("Profile updated.");
  });
}
export async function saveBusiness(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        name,
        support_email: z.union([email, z.literal("")]),
        website: previewUrl,
      })
      .parse(input(form));
    const { db } = await account(true);
    await changed(
      db
        .from("business_settings")
        .update({ ...v, updated_at: new Date().toISOString() })
        .eq("id", true)
        .select("id")
        .single(),
    );
    return saved("Business details updated.");
  });
}
