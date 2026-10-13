"use server";
import { z } from "zod";
import { PublicError, operationMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { isLocalPg, serverClient } from "@/lib/supabase/server";
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
  if (error) throw new PublicError(operationMessage(error));
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
          : e instanceof PublicError
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
  if (error || !user) throw new PublicError("Please sign in again.");
  const [result, memberships] = await Promise.all([
    db.from("profiles").select("*").eq("id", user.id).single(),
    db.from("company_members").select("*").eq("user_id", user.id),
  ]);
  must(result.error);
  const rawProfile = result.data as Profile;
  const memberRows = (memberships.data ?? []) as {
    company_id: string;
    role: "owner" | "admin" | "member";
  }[];
  const activeCompanyId =
    rawProfile.active_company_id ||
    memberRows[0]?.company_id ||
    "00000000-0000-4000-8000-000000000001";
  const activeMember = memberRows.find((m) => m.company_id === activeCompanyId);
  const isTeam = Boolean(activeMember) || rawProfile.role === "admin";
  const profile: Profile = {
    ...rawProfile,
    role: isTeam ? "admin" : "client",
    active_company_id: activeCompanyId,
  };
  if (admin && !isTeam)
    throw new PublicError("Only the Aiquor team can do this.");
  return {
    db,
    user,
    profile,
    activeCompanyId,
    companyRole: activeMember?.role ?? (isTeam ? "owner" : "client"),
  };
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
    throw new PublicError(
      "The record was not changed. It may no longer be available.",
    );
  }
  must(result.error);
  if (!result.data)
    throw new PublicError(
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
      throw new PublicError(
        "Sign-in failed. Check your email and password, or reset your password.",
      );
    refresh();
    return saved("Signed in.", safeNext(v.next ?? null));
  });
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,62}$/,
    "Use 2–63 lowercase letters, numbers, or hyphens for your workspace URL.",
  );

export async function registerCompany(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        full_name: name,
        email,
        password,
        company_name: z
          .string()
          .trim()
          .min(2, "Enter your company name.")
          .max(120),
        company_slug: slugSchema,
        company_tagline: z.string().trim().max(240).optional(),
        company_website: previewUrl.optional(),
      })
      .parse(input(form));

    const db = await serverClient();
    const signUpRes = await db.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.full_name } },
    });
    if (signUpRes.error || !signUpRes.data.user) {
      throw new PublicError(
        "Could not create your account. Try signing in instead.",
      );
    }

    await db
      .from("profiles")
      .update({ full_name: v.full_name })
      .eq("id", signUpRes.data.user.id);

    const ws = await db.rpc("create_company_workspace", {
      company_name: v.company_name,
      company_slug: v.company_slug,
      company_tagline: v.company_tagline || "",
      company_support_email: v.email,
      company_website: v.company_website || "",
      company_brand_color: "#10b981",
    });
    must(ws.error);
    refresh();
    return saved(
      "Company workspace created. Let’s finish configuring your workspace.",
      "/onboarding",
    );
  });
}

export async function createCompanyWorkspace(_: ActionResult, form: FormData) {
  return run(async () => {
    const raw = input(form);
    const companyName = String(raw.company_name || raw.name || "").trim();
    const autoSlug =
      String(raw.company_slug || "").trim() ||
      companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") +
        "-" +
        Math.random().toString(36).slice(2, 6);

    const v = z
      .object({
        company_name: z
          .string()
          .trim()
          .min(2, "Enter your company name.")
          .max(120),
        company_slug: slugSchema,
        company_tagline: z.string().trim().max(240).optional(),
        company_support_email: z.union([email, z.literal("")]).optional(),
        company_website: previewUrl.optional(),
        company_brand_color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid hex brand color.")
          .optional(),
        redirect_to: z.string().optional(),
      })
      .parse({
        company_name: companyName,
        company_slug: autoSlug,
        company_tagline: raw.company_tagline || raw.tagline || "",
        company_support_email:
          raw.company_support_email || raw.support_email || "",
        company_website: raw.company_website || raw.website || "",
        company_brand_color:
          raw.company_brand_color || raw.brand_color || "#10b981",
        redirect_to: raw.redirect_to || "/dashboard",
      });

    const { db, user } = await account();
    const ws = await db.rpc("create_company_workspace", {
      company_name: v.company_name,
      company_slug: v.company_slug,
      company_tagline: v.company_tagline || "",
      company_support_email: v.company_support_email || user.email || "",
      company_website: v.company_website || "",
      company_brand_color: v.company_brand_color || "#10b981",
    });
    must(ws.error);
    refresh();
    return saved(
      `Workspace "${v.company_name}" created and activated.`,
      safeNext(v.redirect_to || "/dashboard"),
    );
  });
}

export async function switchWorkspace(_: ActionResult, form: FormData) {
  return run(async () => {
    const target_company = uuid.parse(form.get("company_id"));
    const { db } = await account();
    const res = await db.rpc("switch_company_workspace", { target_company });
    must(res.error);
    refresh();
    return saved("Switched active company workspace.");
  });
}

export async function saveCompanyBranding(_: ActionResult, form: FormData) {
  return run(async () => {
    const raw = input(form);
    const v = z
      .object({
        name: z.string().trim().min(1).max(120),
        tagline: z.string().trim().max(240).optional(),
        support_email: z.union([email, z.literal("")]),
        website: previewUrl,
        brand_color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid hex brand color.")
          .optional(),
        onboarding_completed: z.string().optional(),
      })
      .parse({
        ...raw,
        brand_color: raw.brand_color || raw.primary_color || "#10b981",
      });

    const { db, activeCompanyId } = await account(true);
    const nowIso = new Date().toISOString();
    await changed(
      db
        .from("companies")
        .update({
          name: v.name,
          tagline: v.tagline ?? "",
          support_email: v.support_email,
          website: v.website,
          brand_color: v.brand_color || "#10b981",
          ...(v.onboarding_completed === "true"
            ? { onboarding_completed: true }
            : {}),
          updated_at: nowIso,
        })
        .eq("id", activeCompanyId)
        .select("id")
        .single(),
    );
    await db
      .from("business_settings")
      .update({
        name: v.name,
        support_email: v.support_email,
        website: v.website,
        updated_at: nowIso,
      })
      .eq("id", true);
    refresh();
    return saved("Company profile and branding saved.");
  });
}

export async function completeOnboarding(_: ActionResult, form: FormData) {
  void form;
  return run(async () => {
    const { db, activeCompanyId } = await account(true);
    await changed(
      db
        .from("companies")
        .update({
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeCompanyId)
        .select("id")
        .single(),
    );
    return saved("Onboarding complete. Welcome to your workspace.", "/dashboard");
  });
}

export async function inviteTeamMember(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        email,
        role: z.enum(["admin", "member"]),
      })
      .parse(input(form));
    const { db, user, activeCompanyId } = await account(true);
    const allowed = await db.rpc("check_company_entitlement", {
      comp: activeCompanyId,
      resource_kind: "team_members",
    });
    if (allowed.data === false) {
      throw new PublicError(
        "Your workspace has reached the team member limit for its current plan. Upgrade in Settings → Subscription & Billing.",
      );
    }
    const ins = await db
      .from("company_invitations")
      .insert({
        company_id: activeCompanyId,
        email: v.email,
        role: v.role,
        invited_by: user.id,
      })
      .select("id")
      .single();
    must(ins.error);
    if (isLocalPg()) {
      const admin = adminClient();
      await admin.auth.admin.inviteUserByEmail(v.email);
    }
    refresh();
    return saved(
      `Team invitation (${v.role}) prepared for ${v.email}. External email delivery is paused until approved.`,
    );
  });
}

export async function acceptTeamInvitation(_: ActionResult, form: FormData) {
  return run(async () => {
    const invitation_id = uuid.parse(
      form.get("invitation_id") || form.get("invitation") || form.get("id"),
    );
    const { db, user } = await account();
    const fullName = String(form.get("full_name") || "").trim();
    const pass = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (pass) {
      if (pass.length < 12) {
        throw new PublicError("Use a password with at least 12 characters.");
      }
      if (pass !== confirm) {
        throw new PublicError("Passwords do not match.");
      }
      const auth = await db.auth.updateUser({ password: pass });
      if (auth.error)
        throw new PublicError(
          "Invitation accepted, but your password could not be updated. Try setting it again.",
        );
    }
    if (fullName) {
      await db
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    const res = await db.rpc("accept_company_invitation", { invitation_id });
    must(res.error);
    return saved("Joined company workspace.", "/dashboard");
  });
}

export async function revokeTeamInvitation(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("invitation_id") || form.get("id"));
    const { db } = await account(true);
    await changed(
      db
        .from("company_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("accepted_at", null)
        .select("id")
        .single(),
    );
    return saved("Team invitation revoked.");
  });
}

export async function updateTeamMemberRole(_: ActionResult, form: FormData) {
  return run(async () => {
    const rawUserId = form.get("user_id") || form.get("member_id");
    const v = z
      .object({
        user_id: uuid,
        role: z.enum(["admin", "member"]),
      })
      .parse({
        user_id: rawUserId,
        role: form.get("role"),
      });
    const { db, activeCompanyId } = await account(true);
    await changed(
      db
        .from("company_members")
        .update({ role: v.role })
        .eq("company_id", activeCompanyId)
        .eq("user_id", v.user_id)
        .select("user_id")
        .single(),
    );
    return saved("Team member role updated.");
  });
}

export async function removeTeamMember(_: ActionResult, form: FormData) {
  return run(async () => {
    const user_id = uuid.parse(form.get("user_id") || form.get("member_id"));
    const { db, activeCompanyId } = await account(true);
    await changed(
      db
        .from("company_members")
        .delete()
        .eq("company_id", activeCompanyId)
        .eq("user_id", user_id)
        .select("user_id")
        .single(),
    );
    return saved("Team member removed from workspace.");
  });
}

const taskSchema = z.object({
  project_id: uuid,
  milestone_id: z.union([uuid, z.literal("")]).optional(),
  title: z.string().trim().min(1, "Enter a task title.").max(200),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(["todo", "in_progress", "in_review", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  assignee_id: z.union([uuid, z.literal("")]).optional(),
  assignee_name: z.string().trim().max(120).optional(),
  due_date: optionalDate,
});

export async function addProjectTask(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = taskSchema.parse(input(form));
    const { db, user, activeCompanyId } = await account(true);
    let assigneeName = v.assignee_name || "";
    if (v.assignee_id && !assigneeName) {
      const prof = await db
        .from("profiles")
        .select("full_name")
        .eq("id", v.assignee_id)
        .maybeSingle();
      assigneeName = prof.data?.full_name || "Team member";
    }
    await changed(
      db
        .from("project_tasks")
        .insert({
          company_id: activeCompanyId,
          project_id: v.project_id,
          milestone_id: v.milestone_id || null,
          title: v.title,
          description: v.description || "",
          status: v.status,
          priority: v.priority,
          assignee_id: v.assignee_id || null,
          assignee_name: assigneeName,
          due_date: v.due_date,
          created_by: user.id,
        })
        .select("id")
        .single(),
    );
    return saved("Task added to project.");
  });
}

export async function updateProjectTask(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const v = taskSchema.parse(input(form));
    const { db } = await account(true);
    let assigneeName = v.assignee_name || "";
    if (v.assignee_id && !assigneeName) {
      const prof = await db
        .from("profiles")
        .select("full_name")
        .eq("id", v.assignee_id)
        .maybeSingle();
      assigneeName = prof.data?.full_name || "Team member";
    }
    await changed(
      db
        .from("project_tasks")
        .update({
          milestone_id: v.milestone_id || null,
          title: v.title,
          description: v.description || "",
          status: v.status,
          priority: v.priority,
          assignee_id: v.assignee_id || null,
          assignee_name: assigneeName,
          due_date: v.due_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id")
        .single(),
    );
    return saved("Task updated.");
  });
}

export async function setTaskStatus(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        id: uuid,
        status: z.enum(["todo", "in_progress", "in_review", "done"]),
      })
      .parse(input(form));
    const { db } = await account(true);
    await changed(
      db
        .from("project_tasks")
        .update({
          status: v.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.id)
        .select("id")
        .single(),
    );
    return saved("Task status updated.");
  });
}

export async function deleteProjectTask(_: ActionResult, form: FormData) {
  return run(async () => {
    const id = uuid.parse(form.get("id"));
    const { db } = await account(true);
    await changed(
      db.from("project_tasks").delete().eq("id", id).select("id").single(),
    );
    return saved("Task removed.");
  });
}

export async function selectSubscriptionPlan(_: ActionResult, form: FormData) {
  return run(async () => {
    const v = z
      .object({
        plan_id: z.enum(["free", "pro", "business"]),
        billing_cycle: z.enum(["monthly", "yearly"]).optional(),
        billing_email: z.union([email, z.literal("")]).optional(),
      })
      .parse(input(form));
    const { db, user, activeCompanyId } = await account(true);
    await changed(
      db
        .from("company_subscriptions")
        .update({
          plan_id: v.plan_id,
          billing_cycle: v.billing_cycle || "monthly",
          billing_email: v.billing_email || user.email || "",
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", activeCompanyId)
        .select("company_id")
        .single(),
    );
    return saved(
      `Workspace plan configured to ${v.plan_id.toUpperCase()} (Billing preparation mode — no payment charged).`,
    );
  });
}

export async function saveNotificationPreferences(
  _: ActionResult,
  form: FormData,
) {
  return run(async () => {
    const email_notifications = form.get("email_notifications") === "true";
    const { db, user } = await account();
    await changed(
      db
        .from("profiles")
        .update({ email_notifications })
        .eq("id", user.id)
        .select("id")
        .single(),
    );
    return saved(
      email_notifications
        ? "Email digest preference enabled (external delivery remains paused until approved)."
        : "In-app notifications only.",
    );
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
      throw new PublicError(
        "Invitation accepted, but your password could not be updated. Try setting it again.",
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
    const { db, activeCompanyId } = await account(true);
    const allowed = await db.rpc("check_company_entitlement", {
      comp: activeCompanyId,
      resource_kind: "clients",
    });
    if (allowed.data === false) {
      throw new PublicError(
        "Your workspace has reached the client limit for its current plan. Upgrade in Settings → Subscription & Billing.",
      );
    }
    const result = await db
      .from("clients")
      .insert({ ...v, company_id: activeCompanyId })
      .select("id")
      .single();
    if (result.error?.code === "23505")
      throw new PublicError("A client with this email already exists.");
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
    const { db, user, activeCompanyId } = await account(true);
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
          company_id: activeCompanyId,
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
        throw new PublicError(
          "The invitation is saved, but email delivery failed. Please try again or contact Aiquor.",
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
    const { db, activeCompanyId } = await account(true);
    const allowed = await db.rpc("check_company_entitlement", {
      comp: activeCompanyId,
      resource_kind: "projects",
    });
    if (allowed.data === false) {
      throw new PublicError(
        "Your workspace has reached the active project limit for its current plan. Upgrade in Settings → Subscription & Billing.",
      );
    }
    const result = await db
      .from("projects")
      .insert({ ...v, company_id: activeCompanyId })
      .select("id")
      .single();
    must(result.error);
    if (!result.data) throw new PublicError("Project was not saved.");
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
      throw new PublicError(
        "The record was not changed. It may no longer be available.",
      );
    if (current.data.archived)
      throw new PublicError(
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
      throw new PublicError("Describe the changes you need.");
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
        : "Change request saved. The workspace team has been notified.",
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
    if (!file.data) throw new PublicError("File not found.");
    if (file.data.uploaded_by !== user.id && profile.role !== "admin")
      throw new PublicError("You can only delete files you uploaded.");
    const proj = await db
      .from("projects")
      .select("archived,status")
      .eq("id", file.data.project_id)
      .maybeSingle();
    must(proj.error);
    if (!proj.data || proj.data.archived || proj.data.status === "completed")
      throw new PublicError("This project is read-only.");
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
    const { db, activeCompanyId } = await account(true);
    const nowIso = new Date().toISOString();
    await db
      .from("companies")
      .update({ ...v, updated_at: nowIso })
      .eq("id", activeCompanyId);
    await changed(
      db
        .from("business_settings")
        .update({ ...v, updated_at: nowIso })
        .eq("id", true)
        .select("id")
        .single(),
    );
    return saved("Business details updated.");
  });
}
