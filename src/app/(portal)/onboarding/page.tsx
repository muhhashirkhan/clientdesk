import Link from "next/link";
import {
  Building2,
  Users,
  FolderKanban,
  UserPlus,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  Palette,
} from "lucide-react";
import { session, check } from "@/lib/data";
import { Badge } from "@/components/ui";
import { Form, Field, Hidden } from "@/components/forms";
import { ProjectFields } from "@/components/project-fields";
import {
  createCompanyWorkspace,
  saveCompanyBranding,
  inviteTeamMember,
  createClientRecord,
  inviteClient,
  createProject,
  completeOnboarding,
} from "@/app/actions";
import type { Client, Project, CompanyInvitation } from "@/lib/types";

export default async function OnboardingPage() {
  const { db, company, workspaceRole, user } = await session();

  if (!company) {
    return (
      <div className="settings-workspace">
        <header className="command-header page-heading settings-workspace-header glass-container">
          <div className="command-header-main">
            <div className="command-eyebrow-row">
              <p className="eyebrow">STAGE 8.1 · WORKSPACE INITIALIZATION</p>
              <Badge value="draft" />
            </div>
            <h1>Create your company workspace</h1>
            <p className="muted">
              Set up an isolated multi-tenant workspace for your organization.
            </p>
          </div>
        </header>
        <section className="panel settings-card glass-container">
          <Form action={createCompanyWorkspace} submit="Create workspace">
            <div className="form-grid">
              <Field
                label="Company name"
                name="company_name"
                maxLength={120}
                placeholder="e.g. Vance Studio"
              />
              <Field
                label="Workspace URL slug"
                name="company_slug"
                maxLength={63}
                placeholder="e.g. vance-studio"
              />
            </div>
            <Field
              label="Tagline"
              name="company_tagline"
              required={false}
              maxLength={240}
              placeholder="Digital product design & engineering"
            />
            <div className="form-grid">
              <Field
                label="Support email"
                name="company_support_email"
                type="email"
                required={false}
                value={user.email || ""}
              />
              <Field
                label="Website"
                name="company_website"
                type="url"
                required={false}
                placeholder="https://vancestudio.com"
              />
            </div>
          </Form>
        </section>
      </div>
    );
  }

  const [clientsRes, projectsRes, teamInvitesRes, teamMembersRes] =
    await Promise.all([
      db.from("clients").select("*").order("created_at", { ascending: false }),
      db.from("projects").select("*").order("created_at", { ascending: false }),
      db
        .from("company_invitations")
        .select("*")
        .eq("company_id", company.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      db
        .from("company_members")
        .select("user_id,role")
        .eq("company_id", company.id),
    ]);
  check(clientsRes.error);
  check(projectsRes.error);
  check(teamInvitesRes.error);
  check(teamMembersRes.error);

  const clients = (clientsRes.data ?? []) as Client[];
  const projects = (projectsRes.data ?? []) as Project[];
  const teamInvites = (teamInvitesRes.data ?? []) as CompanyInvitation[];
  const teamMembersCount = (teamMembersRes.data ?? []).length;

  const hasBranding = Boolean(
    company.name && (company.tagline || company.support_email || company.website),
  );
  const hasTeamStep = teamMembersCount > 1 || teamInvites.length > 0;
  const hasClient = clients.length > 0;
  const hasProject = projects.length > 0;

  const completedSteps = [
    hasBranding,
    hasTeamStep,
    hasClient,
    hasProject,
  ].filter(Boolean).length;

  return (
    <div className="settings-workspace">
      <header className="command-header page-heading settings-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">COMPANY ONBOARDING · {company.slug.toUpperCase()}</p>
            <Badge value={company.onboarding_completed ? "approved" : "active"} />
          </div>
          <h1>Welcome to {company.name}</h1>
          <p className="muted">
            Configure your company branding, invite your team, add your first
            client, and launch your first project.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Onboarding progress summary"
          >
            <span className="command-summary-pill is-clear">
              <Sparkles size={13} aria-hidden="true" />
              <span>
                <strong>{completedSteps}/4</strong> onboarding milestones
                configured
              </span>
            </span>
            <span className="command-summary-pill">
              <Building2 size={13} aria-hidden="true" />
              <span>
                Role: <strong>{workspaceRole.toUpperCase()}</strong>
              </span>
            </span>
          </div>
        </div>

        <div className="command-header-actions">
          <Form
            action={completeOnboarding}
            submit="Finish & open Command Center"
            className="plain-form"
          />
        </div>
      </header>

      <div className="settings-grid">
        {/* Step 1: Company Profile & Branding */}
        <section className="panel settings-card glass-container">
          <div className="settings-card-head">
            <div className="settings-card-icon glass-container glass-container-circle">
              <Palette size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">
                STEP 1 {hasBranding ? "· CONFIGURED" : "· BRANDING"}
              </p>
              <h2>Company Profile & Branding</h2>
              <p className="muted small">
                Customize how your workspace appears to clients and team members.
              </p>
            </div>
          </div>

          <Form action={saveCompanyBranding} submit="Save company branding">
            <Hidden name="onboarding_completed" value="true" />
            <Field
              label="Company name"
              name="name"
              value={company.name}
              maxLength={120}
            />
            <Field
              label="Company tagline"
              name="tagline"
              value={company.tagline}
              required={false}
              maxLength={240}
              placeholder="e.g. Strategic AI & digital product studio"
            />
            <div className="form-grid">
              <Field
                label="Support email"
                name="support_email"
                type="email"
                value={company.support_email}
                required={false}
                placeholder="support@company.com"
              />
              <Field
                label="Website"
                name="website"
                type="url"
                value={company.website}
                required={false}
                placeholder="https://company.com"
              />
            </div>
            <Field
              label="Brand accent color (Hex)"
              name="brand_color"
              value={company.brand_color || "#10b981"}
              required={false}
              placeholder="#10b981"
            />
          </Form>
        </section>

        {/* Step 2: Invite Team Members */}
        <section className="panel settings-card glass-container">
          <div className="settings-card-head">
            <div className="settings-card-icon glass-container glass-container-circle">
              <UserPlus size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">
                STEP 2 {hasTeamStep ? "· TEAM INVITED" : "· TEAM COLLABORATION"}
              </p>
              <h2>Invite Team Members</h2>
              <p className="muted small">
                Add admins and team members to collaborate across your company
                projects.
              </p>
            </div>
          </div>

          <Form action={inviteTeamMember} submit="Invite team member" reset>
            <Field
              label="Teammate email"
              name="email"
              type="email"
              placeholder="teammate@company.com"
            />
            <label className="field">
              Workspace role
              <select name="role" defaultValue="member">
                <option value="member">
                  Member (Manage projects, milestones & tasks)
                </option>
                <option value="admin">
                  Admin (Full workspace, team & client management)
                </option>
              </select>
            </label>
          </Form>

          {teamInvites.length > 0 && (
            <div className="stack" style={{ marginTop: 16 }}>
              <p className="caption">PENDING TEAM INVITATIONS</p>
              {teamInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="row-between"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "rgba(16, 185, 129, 0.06)",
                  }}
                >
                  <span>
                    <strong>{inv.email}</strong> · {inv.role}
                  </span>
                  <Badge value={inv.accepted_at ? "approved" : "in_review"} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 3: Add & Invite First Client */}
        <section className="panel settings-card glass-container">
          <div className="settings-card-head">
            <div className="settings-card-icon glass-container glass-container-circle">
              <Users size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">
                STEP 3 {hasClient ? "· CLIENT READY" : "· FIRST CLIENT"}
              </p>
              <h2>Add & Invite Your First Client</h2>
              <p className="muted small">
                Create a client record and prepare their isolated portal access.
              </p>
            </div>
          </div>

          <Form action={createClientRecord} submit="Create client" reset>
            <div className="form-grid">
              <Field
                label="Client contact name"
                name="name"
                maxLength={120}
                placeholder="e.g. Jordan Mercer"
              />
              <Field
                label="Client email"
                name="email"
                type="email"
                placeholder="jordan@mercerlabs.com"
              />
            </div>
            <Field
              label="Client company"
              name="company"
              required={false}
              maxLength={160}
              placeholder="e.g. Mercer Labs"
            />
          </Form>

          {clients.length > 0 && (
            <div className="stack" style={{ marginTop: 16 }}>
              <p className="caption">SAVED CLIENTS ({clients.length})</p>
              {clients.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="row-between"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.03)",
                  }}
                >
                  <div>
                    <strong>{c.name}</strong>
                    <p className="muted small">{c.email}</p>
                  </div>
                  <Form
                    action={inviteClient}
                    submit="Invite client"
                    className="plain-form"
                  >
                    <Hidden name="client_id" value={c.id} />
                  </Form>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 4: Set Up First Project */}
        <section className="panel settings-card glass-container">
          <div className="settings-card-head">
            <div className="settings-card-icon glass-container glass-container-circle">
              <FolderKanban size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">
                STEP 4 {hasProject ? "· PROJECT CREATED" : "· FIRST PROJECT"}
              </p>
              <h2>Create Your First Project</h2>
              <p className="muted small">
                Set up a shared project workspace for milestones, tasks, files,
                and approvals.
              </p>
            </div>
          </div>

          {clients.length === 0 ? (
            <p className="muted">
              Add your first client in Step 3 above to assign them a project.
            </p>
          ) : (
            <Form action={createProject} submit="Create first project">
              <ProjectFields clients={clients} />
            </Form>
          )}

          {projects.length > 0 && (
            <div className="stack" style={{ marginTop: 16 }}>
              <p className="caption">ACTIVE PROJECTS ({projects.length})</p>
              {projects.slice(0, 3).map((proj) => (
                <Link
                  key={proj.id}
                  href={`/projects/${proj.id}`}
                  className="row-between"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(16, 185, 129, 0.08)",
                  }}
                >
                  <span>
                    <CheckCircle2
                      size={14}
                      style={{ display: "inline", marginRight: 6 }}
                    />
                    <strong>{proj.name}</strong>
                  </span>
                  <span className="muted small">
                    Open project <ArrowUpRight size={13} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

