import Link from "next/link";
import {
  User,
  Shield,
  Building2,
  Mail,
  Globe,
  KeyRound,
  LogOut,
  ArrowUpRight,
  Users,
  CreditCard,
  Bell,
  Sparkles,
  PlusCircle,
} from "lucide-react";
import { session, check } from "@/lib/data";
import { Badge } from "@/components/ui";
import { Form, Field, Hidden } from "@/components/forms";
import {
  saveProfile,
  saveCompanyBranding,
  createCompanyWorkspace,
  inviteTeamMember,
  acceptTeamInvitation,
  revokeTeamInvitation,
  updateTeamMemberRole,
  removeTeamMember,
  selectSubscriptionPlan,
  saveNotificationPreferences,
  signOut,
} from "@/app/actions";
import { date, bytes } from "@/lib/utils";
import type {
  CompanyMember,
  CompanyInvitation,
  SubscriptionPlan,
  CompanySubscription,
} from "@/lib/types";

export default async function Settings() {
  const {
    db,
    user,
    profile,
    company,
    companies,
    workspaceRole,
    isOwnerOrAdmin,
  } = await session();

  const business = await db
    .from("business_settings")
    .select("*")
    .eq("id", true)
    .single();
  check(business.error);

  const activeCompanyId = company?.id || profile.active_company_id || "";

  const [
    membersRes,
    teamInvitesRes,
    plansRes,
    subRes,
    projectsCountRes,
    clientsCountRes,
    filesRes,
  ] = await Promise.all([
    activeCompanyId
      ? db
          .from("company_members")
          .select("*")
          .eq("company_id", activeCompanyId)
          .order("joined_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    db
      .from("company_invitations")
      .select("*")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    db
      .from("subscription_plans")
      .select("*")
      .order("price_monthly_cents", { ascending: true }),
    activeCompanyId
      ? db
          .from("company_subscriptions")
          .select("*")
          .eq("company_id", activeCompanyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("archived", false),
    db.from("clients").select("id", { count: "exact", head: true }),
    db.from("project_files").select("size"),
  ]);

  check(membersRes.error);
  check(teamInvitesRes.error);
  check(plansRes.error);
  check(subRes.error);
  check(projectsCountRes.error);
  check(clientsCountRes.error);
  check(filesRes.error);

  const rawMembers = (membersRes.data ?? []) as CompanyMember[];
  const memberIds = rawMembers.map((m) => m.user_id);
  const memberProfilesRes = memberIds.length
    ? await db.from("profiles").select("id,full_name").in("id", memberIds)
    : { data: [], error: null };
  check(memberProfilesRes.error);
  const memberProfiles = (memberProfilesRes.data ?? []) as {
    id: string;
    full_name: string;
  }[];
  const teamMembers = rawMembers.map((m) => ({
    ...m,
    full_name:
      memberProfiles.find((p) => p.id === m.user_id)?.full_name ||
      (m.user_id === user.id ? profile.full_name || user.email || "You" : "Team member"),
  }));
  const allPendingInvites = (teamInvitesRes.data ?? []) as CompanyInvitation[];
  const companyPendingInvites = allPendingInvites.filter(
    (inv) => inv.company_id === activeCompanyId,
  );
  const myPendingTeamInvites = allPendingInvites.filter(
    (inv) => inv.email.toLowerCase() === (user.email || "").toLowerCase(),
  );
  const plans = (plansRes.data ?? []) as SubscriptionPlan[];
  const subscription = subRes.data as CompanySubscription | null;

  const currentPlanId = subscription?.plan_id || company?.plan_id || "pro";
  const currentPlan =
    plans.find((p) => p.id === currentPlanId) ||
    plans.find((p) => p.id === "pro") ||
    plans[0];

  const activeProjectsUsage = projectsCountRes.count ?? 0;
  const clientsUsage = clientsCountRes.count ?? 0;
  const teamUsage = teamMembers.length;
  const storageBytesUsage = (filesRes.data ?? []).reduce(
    (acc: number, row: { size?: number }) => acc + Number(row.size || 0),
    0,
  );

  const admin = workspaceRole !== "client" || profile.role === "admin";
  const initial = (profile.full_name || user.email || "A")[0].toUpperCase();
  const displayCompanyName = company?.name || business.data?.name || "Aiquor";

  return (
    <div className="settings-workspace">
      <header className="command-header page-heading settings-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">WORKSPACE &amp; ACCOUNT GOVERNANCE</p>
            <Badge value={workspaceRole} />
          </div>
          <h1>Settings</h1>
          <p className="muted">
            Manage your profile, company branding, team members, workspace
            entitlements, and security controls.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Account and workspace summary"
          >
            <span className="command-summary-pill">
              <User size={13} aria-hidden="true" />
              <span>
                <strong>{profile.full_name || "Account"}</strong> ·{" "}
                {workspaceRole.toUpperCase()}
              </span>
            </span>

            {user.email && (
              <span className="command-summary-pill">
                <Mail size={13} aria-hidden="true" />
                <span>{user.email}</span>
              </span>
            )}

            <span className="command-summary-pill is-clear">
              <Building2 size={13} aria-hidden="true" />
              <span>
                <strong>{displayCompanyName}</strong> ({companies.length}{" "}
                {companies.length === 1 ? "workspace" : "workspaces"})
              </span>
            </span>

            {currentPlan && (
              <span className="command-summary-pill">
                <CreditCard size={13} aria-hidden="true" />
                <span>
                  <strong>{currentPlan.name}</strong> Plan
                </span>
              </span>
            )}
          </div>
        </div>
      </header>

      {myPendingTeamInvites.length > 0 && (
        <section
          className="panel command-invite-banner glass-container"
          aria-label="Pending team invitations"
        >
          <div className="command-invite-copy">
            <p className="eyebrow">TEAM INVITATION</p>
            <h2>You have been invited to join a company workspace</h2>
            <p className="muted">
              Accept your invitation below to access the company workspace and
              switch between workspaces anytime.
            </p>
          </div>
          <div className="command-invite-actions">
            {myPendingTeamInvites.map((inv) => (
              <Form
                key={inv.id}
                action={acceptTeamInvitation}
                submit={`Join as ${inv.role}`}
                className="small-form"
              >
                <Hidden name="invitation" value={inv.id} />
              </Form>
            ))}
          </div>
        </section>
      )}

      <div className="settings-grid">
        <div className="settings-column">
          <section className="panel settings-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">ACCOUNT IDENTITY</p>
                <h2>Your profile</h2>
              </div>
              <span className="avatar large glass-container glass-container-circle">
                {initial}
              </span>
            </div>
            <p className="muted">
              Your name appears on project comments, tasks, submissions and
              recorded decisions.
            </p>

            <Form action={saveProfile} submit="Save profile">
              <Field
                label="Full name"
                name="full_name"
                value={profile.full_name}
                maxLength={120}
              />
              <label className="field">
                Account email
                <span className="optional">Verified</span>
                <input value={user.email || ""} readOnly aria-readonly="true" />
                <small>
                  Used for workspace authentication and security notifications.
                </small>
              </label>
            </Form>
          </section>

          <section className="panel settings-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">COMMUNICATION PREFERENCES</p>
                <h2>Notification settings</h2>
              </div>
              <span
                className="settings-section-icon glass-container glass-container-circle"
                aria-hidden="true"
              >
                <Bell size={18} />
              </span>
            </div>
            <p className="muted">
              In-app notifications are always active for your workspace. Email
              notification delivery is prepared in staging mode (no external
              emails are sent without approval).
            </p>
            <Form
              action={saveNotificationPreferences}
              submit="Save notification preferences"
            >
              <label className="field">
                Email notification digest (Prepared)
                <select
                  name="email_notifications"
                  defaultValue={
                    profile.email_notifications !== false ? "true" : "false"
                  }
                >
                  <option value="true">
                    Enabled — Prepare email alerts for project &amp; approval events
                  </option>
                  <option value="false">
                    Disabled — In-app notifications only
                  </option>
                </select>
              </label>
            </Form>
          </section>

          <section className="panel settings-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">MULTI-COMPANY WORKSPACES</p>
                <h2>Create another workspace</h2>
              </div>
              <span
                className="settings-section-icon glass-container glass-container-circle"
                aria-hidden="true"
              >
                <PlusCircle size={18} />
              </span>
            </div>
            <p className="muted">
              Launch an isolated company workspace with its own clients,
              projects, team members, and role permissions.
            </p>
            <Form
              action={createCompanyWorkspace}
              submit="Create company workspace"
              reset
            >
              <Field
                label="New company name"
                name="company_name"
                maxLength={120}
                placeholder="e.g. Horizon Ventures Studio"
              />
              <div className="form-grid">
                <Field
                  label="Support email"
                  name="support_email"
                  type="email"
                  required={false}
                  placeholder="hello@horizon.studio"
                />
                <Field
                  label="Website"
                  name="website"
                  type="url"
                  required={false}
                  placeholder="https://horizon.studio"
                />
              </div>
              <Field
                label="Tagline"
                name="tagline"
                required={false}
                maxLength={180}
                placeholder="Product strategy & client delivery"
              />
            </Form>
          </section>

          <section className="panel settings-panel settings-security-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">AUTHENTICATION &amp; SESSION</p>
                <h2>Password &amp; security</h2>
              </div>
              <span
                className="settings-section-icon glass-container glass-container-circle"
                aria-hidden="true"
              >
                <Shield size={18} />
              </span>
            </div>

            <div className="settings-security-block">
              <div className="settings-security-item">
                <div>
                  <h3>
                    <KeyRound size={15} aria-hidden="true" />
                    Password recovery
                  </h3>
                  <p>
                    Request a secure password-reset link sent to your verified
                    account email.
                  </p>
                </div>
                <Link href="/forgot-password" className="text-link">
                  Reset your password →
                </Link>
              </div>

              <div className="settings-security-item is-session">
                <div>
                  <h3>
                    <LogOut size={15} aria-hidden="true" />
                    Active session
                  </h3>
                  <p>
                    Signed in as <strong>{user.email}</strong>. Sign out to end
                    your current session on this device.
                  </p>
                </div>
                <Form
                  action={signOut}
                  submit="Sign out"
                  className="settings-signout"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="settings-column">
          {isOwnerOrAdmin && company && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">WORKSPACE BRANDING</p>
                  <h2>Company profile &amp; details</h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <Building2 size={18} />
                </span>
              </div>
              <p className="muted">
                The organization identity, accent color, and contact details
                your team and clients see in this workspace.
              </p>

              <Form action={saveCompanyBranding} submit="Save company profile">
                <Field
                  label="Company name"
                  name="name"
                  value={company.name}
                  maxLength={120}
                />
                <Field
                  label="Workspace tagline"
                  name="tagline"
                  value={company.tagline || ""}
                  required={false}
                  maxLength={180}
                  placeholder="Premium client delivery & approvals"
                />
                <div className="form-grid">
                  <Field
                    label="Support email"
                    name="support_email"
                    value={company.support_email || ""}
                    type="email"
                    required={false}
                    placeholder="support@company.com"
                  />
                  <Field
                    label="Website"
                    name="website"
                    type="url"
                    value={company.website || ""}
                    required={false}
                    placeholder="https://company.com"
                  />
                </div>
                <div className="form-grid">
                  <Field
                    label="Brand accent color"
                    name="primary_color"
                    value={company.primary_color || "#10b981"}
                    required={false}
                    placeholder="#10b981"
                  />
                  <Field
                    label="Logo URL"
                    name="logo_url"
                    type="url"
                    value={company.logo_url || ""}
                    required={false}
                    placeholder="https://company.com/logo.png"
                  />
                </div>
              </Form>

              <div className="settings-panel-footer">
                <span>
                  Workspace Role: <strong>{workspaceRole.toUpperCase()}</strong>
                </span>
                <span>Updated {date(company.updated_at)}</span>
              </div>
            </section>
          )}

          {admin && company && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">TEAM COLLABORATION</p>
                  <h2>Team members ({teamMembers.length})</h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <Users size={18} />
                </span>
              </div>
              <p className="muted">
                Manage who has access to {company.name} and their workspace
                permissions.
              </p>

              <div className="file-list" style={{ marginBottom: "1rem" }}>
                {teamMembers.map((member) => (
                  <article key={member.user_id} className="file-row">
                    <div className="file-description">
                      <strong>{member.full_name || "Team member"}</strong>
                      <small>
                        Role: {member.role.toUpperCase()} · Joined{" "}
                        {date(member.joined_at)}
                      </small>
                    </div>
                    <div className="file-row-actions">
                      <Badge value={member.role} />
                      {isOwnerOrAdmin &&
                        member.role !== "owner" &&
                        member.user_id !== user.id && (
                          <>
                            <Form
                              action={updateTeamMemberRole}
                              submit={
                                member.role === "admin"
                                  ? "Make member"
                                  : "Make admin"
                              }
                              className="small-form"
                            >
                              <Hidden name="user_id" value={member.user_id} />
                              <Hidden
                                name="role"
                                value={
                                  member.role === "admin" ? "member" : "admin"
                                }
                              />
                            </Form>
                            <Form
                              action={removeTeamMember}
                              submit="Remove"
                              danger
                              className="small-form"
                            >
                              <Hidden name="user_id" value={member.user_id} />
                            </Form>
                          </>
                        )}
                    </div>
                  </article>
                ))}
              </div>

              {isOwnerOrAdmin && (
                <>
                  <Form
                    action={inviteTeamMember}
                    submit="Send team invitation"
                    reset
                  >
                    <div className="form-grid">
                      <Field
                        label="Teammate email"
                        name="email"
                        type="email"
                        placeholder="colleague@company.com"
                      />
                      <label className="field">
                        Workspace role
                        <select name="role" defaultValue="member">
                          <option value="member">
                            Team Member (Projects, milestones, tasks, files)
                          </option>
                          <option value="admin">
                            Workspace Admin (Full team, client &amp; settings access)
                          </option>
                        </select>
                      </label>
                    </div>
                  </Form>

                  {companyPendingInvites.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <p className="eyebrow">PENDING TEAM INVITATIONS</p>
                      <div className="file-list">
                        {companyPendingInvites.map((inv) => (
                          <article key={inv.id} className="file-row">
                            <div className="file-description">
                              <strong>{inv.email}</strong>
                              <small>
                                Role: {inv.role.toUpperCase()} · Expires{" "}
                                {date(inv.expires_at)}
                              </small>
                            </div>
                            <div className="file-row-actions">
                              <Form
                                action={revokeTeamInvitation}
                                submit="Revoke"
                                danger
                                className="small-form"
                              >
                                <Hidden name="id" value={inv.id} />
                              </Form>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {admin && company && currentPlan && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">SUBSCRIPTION &amp; BILLING PREPARATION</p>
                  <h2>
                    {currentPlan.name} Plan ·{" "}
                    {subscription?.status
                      ? subscription.status.toUpperCase()
                      : "ACTIVE"}
                  </h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <CreditCard size={18} />
                </span>
              </div>

              <div className="notice" style={{ marginBottom: "1rem" }}>
                <Sparkles size={16} />
                <span>
                  <strong>Billing Preparation Mode:</strong> Plan entitlements
                  and workspace usage limits are enforced, but live payment
                  processing is disabled. No charges are collected.
                </span>
              </div>

              <div className="project-overview-metrics" style={{ marginBottom: "1rem" }}>
                <div>
                  <span>Active projects</span>
                  <strong>
                    {activeProjectsUsage} / {currentPlan.max_projects}
                  </strong>
                </div>
                <div>
                  <span>Team members</span>
                  <strong>
                    {teamUsage} / {currentPlan.max_team_members}
                  </strong>
                </div>
                <div>
                  <span>Clients</span>
                  <strong>
                    {clientsUsage} / {currentPlan.max_clients}
                  </strong>
                </div>
                <div>
                  <span>Storage used</span>
                  <strong>
                    {bytes(storageBytesUsage)} / {currentPlan.max_storage_mb} MB
                  </strong>
                </div>
              </div>

              {isOwnerOrAdmin && (
                <Form
                  action={selectSubscriptionPlan}
                  submit="Update prepared plan tier"
                >
                  <label className="field">
                    Select workspace plan tier (No charge)
                    <select name="plan_id" defaultValue={currentPlan.id}>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} — $
                          {Math.round(plan.price_monthly_cents / 100)}/mo (
                          {plan.max_projects} projects, {plan.max_team_members}{" "}
                          team, {plan.max_clients} clients)
                        </option>
                      ))}
                    </select>
                  </label>
                </Form>
              )}
            </section>
          )}

          {!admin && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">WORKSPACE TEAM</p>
                  <h2>Your team at {displayCompanyName}</h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <Building2 size={18} />
                </span>
              </div>
              <p className="muted">
                Project questions belong in your project discussion so everyone
                has the context.
              </p>

              <div className="settings-contact-list">
                {(company?.support_email || business.data?.support_email) && (
                  <a
                    className="settings-contact-row"
                    href={
                      "mailto:" +
                      (company?.support_email || business.data?.support_email)
                    }
                  >
                    <Mail size={16} aria-hidden="true" />
                    <div>
                      <span>Direct support email</span>
                      <strong>
                        {company?.support_email || business.data?.support_email}
                      </strong>
                    </div>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}

                {(company?.website || business.data?.website) && (
                  <a
                    className="settings-contact-row"
                    href={company?.website || business.data?.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe size={16} aria-hidden="true" />
                    <div>
                      <span>Organization website</span>
                      <strong>Visit website ↗</strong>
                    </div>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}
              </div>

              <div className="settings-panel-footer">
                <span>Workspace Role: Client Member</span>
                <Link href="/projects" className="text-link">
                  Open your projects →
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
