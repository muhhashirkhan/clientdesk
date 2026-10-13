import Link from "next/link";
import {
  Users,
  ArrowUpRight,
  Mail,
  Building2,
  FolderKanban,
  UserCheck,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { adminSession, check } from "@/lib/data";
import { Empty, Badge, NewProjectLink } from "@/components/ui";
import { Form, Field, Hidden } from "@/components/forms";
import {
  createClientRecord,
  inviteClient,
  revokeInvitation,
  removeAccess,
} from "@/app/actions";
import {
  date,
  timestamp,
  parsePage,
  pageHref,
  selectLatestInvitations,
} from "@/lib/utils";
import type { Client, Project, Invitation } from "@/lib/types";

const CLIENTS_PAGE_SIZE = 24;

export default async function Clients({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = (await searchParams) ?? {};
  const { db } = await adminSession();
  const now = new Date();
  const nowIso = now.toISOString();

  const [clientsCountRes, allMembersRes, activeInvitesRes] = await Promise.all([
    db.from("clients").select("id", { count: "exact", head: true }),
    db
      .from("client_members")
      .select("client_id,user_id,joined_at")
      .order("joined_at", { ascending: true })
      .order("user_id", { ascending: true }),
    db
      .from("invitations")
      .select("id,client_id,expires_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gte("expires_at", nowIso),
  ]);
  check(clientsCountRes.error);
  check(allMembersRes.error);
  check(activeInvitesRes.error);

  const totalClientsCount = clientsCountRes.count ?? 0;
  const pagination = parsePage(rawPage, totalClientsCount, CLIENTS_PAGE_SIZE);

  const clientsRes = await db
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(pagination.from, pagination.to);
  check(clientsRes.error);

  const clients = (clientsRes.data ?? []) as Client[];
  const clientIds = clients.map((c) => c.id);
  const allMembers = (allMembersRes.data ?? []) as {
    client_id: string;
    user_id: string;
    joined_at: string;
  }[];
  const pageMembers = allMembers.filter((m) => clientIds.includes(m.client_id));
  const pageMemberUserIds = [...new Set(pageMembers.map((m) => m.user_id))];

  const [projectsRes, invitesRes, profilesRes] = await Promise.all([
    clientIds.length
      ? db
          .from("projects")
          .select("id,client_id,name,status,archived")
          .in("client_id", clientIds)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    clientIds.length
      ? db
          .from("invitations")
          .select("*")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    pageMemberUserIds.length
      ? db.from("profiles").select("id,full_name").in("id", pageMemberUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  check(projectsRes.error);
  check(invitesRes.error);
  check(profilesRes.error);

  const projects = (projectsRes.data ?? []) as Pick<
    Project,
    "id" | "client_id" | "name" | "status" | "archived"
  >[];
  const invites = (invitesRes.data ?? []) as Invitation[];
  const latestInviteByClient = selectLatestInvitations(invites);
  const allProfiles = (profilesRes.data ?? []) as {
    id: string;
    full_name: string;
  }[];

  const activeClientIds = new Set(allMembers.map((m) => m.client_id));
  const activeInvites = (activeInvitesRes.data ?? []) as {
    id: string;
    client_id: string;
    expires_at: string;
  }[];
  const pendingInvitesCount = new Set(
    activeInvites
      .filter((i) => !activeClientIds.has(i.client_id))
      .map((i) => i.client_id),
  ).size;

  return (
    <div className="clients-workspace">
      <header className="command-header page-heading clients-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">THE PEOPLE BEHIND THE PROJECTS</p>
            <Badge value="active" />
          </div>
          <h1>Clients</h1>
          <p className="muted">
            Add your client, assign their projects and invite them into their
            protected workspace.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Client directory summary"
          >
            <span className="command-summary-pill">
              <Users size={13} aria-hidden="true" />
              <span>
                <strong>{totalClientsCount}</strong> client
                {totalClientsCount === 1 ? "" : "s"} in directory
              </span>
            </span>

            <span className="command-summary-pill is-clear">
              <UserCheck size={13} aria-hidden="true" />
              <span>
                <strong>{activeClientIds.size}</strong> with active portal
                access
              </span>
            </span>

            {pendingInvitesCount > 0 && (
              <span className="command-summary-pill is-attention">
                <Clock3 size={13} aria-hidden="true" />
                <span>
                  <strong>{pendingInvitesCount}</strong> pending invitation
                  {pendingInvitesCount === 1 ? "" : "s"}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="command-header-actions">
          <NewProjectLink />
        </div>
      </header>

      <details
        id="add-client-panel"
        className="panel create-panel client-create-panel glass-container"
      >
        <summary>
          <Users size={18} aria-hidden="true" />
          Add a client<span>+</span>
        </summary>
        <Form action={createClientRecord} submit="Save client" reset>
          <div className="form-grid">
            <Field
              label="Client name"
              name="name"
              maxLength={120}
              placeholder="e.g. Elena Vance"
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              placeholder="elena@company.com"
            />
          </div>
          <Field
            label="Company"
            name="company"
            required={false}
            maxLength={160}
            placeholder="e.g. Vance Studio"
          />
        </Form>
      </details>

      {!totalClientsCount ? (
        <Empty
          title="Your client list starts here."
          description="Add a real client using the form above. No invitation is sent until you choose Invite client."
        />
      ) : (
        <div className="client-grid">
          {clients.map((client) => {
            const assigned = projects.filter((p) => p.client_id === client.id);
            const invitation = latestInviteByClient.get(client.id);
            const members = pageMembers.filter(
              (m) => m.client_id === client.id,
            );
            const hasActiveInvite =
              invitation &&
              !invitation.accepted_at &&
              !invitation.revoked_at &&
              new Date(invitation.expires_at) >= now;

            return (
              <section
                className="panel client-card glass-container"
                key={client.id}
              >
                <div className="client-card-top">
                  <div className="client-heading">
                    <span className="avatar large glass-container glass-container-circle">
                      {client.name[0]?.toUpperCase() || "C"}
                    </span>
                    <div className="client-heading-text">
                      <h2>{client.name}</h2>
                      <p className="client-company-line">
                        <Building2 size={13} aria-hidden="true" />
                        <span>{client.company || "Individual client"}</span>
                      </p>
                    </div>
                  </div>

                  <span
                    className={`badge glass-container glass-container-pill ${
                      members.length > 0
                        ? "active"
                        : hasActiveInvite
                          ? "in_review"
                          : "planned"
                    }`}
                  >
                    {members.length > 0
                      ? "Portal active"
                      : hasActiveInvite
                        ? "Invite pending"
                        : "Not invited"}
                  </span>
                </div>

                <div className="client-meta-strip">
                  <span className="client-email">
                    <Mail size={13} aria-hidden="true" />
                    <span>{client.email}</span>
                  </span>
                  <span className="client-created-date">
                    Added {date(client.created_at)}
                  </span>
                </div>

                <div className="client-projects">
                  <div className="client-projects-header">
                    <p className="caption">
                      <FolderKanban size={12} aria-hidden="true" />
                      {assigned.length} ASSIGNED PROJECT
                      {assigned.length === 1 ? "" : "S"}
                    </p>
                  </div>
                  {assigned.length ? (
                    <div className="client-project-links">
                      {assigned.map((p) => (
                        <Link
                          key={p.id}
                          href={"/projects/" + p.id}
                          className="client-project-row"
                        >
                          <span className="client-project-name">
                            {p.name}
                            {p.archived ? " · Archived" : ""}
                          </span>
                          <span className="client-project-row-meta">
                            <Badge value={p.archived ? "archived" : p.status} />
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No projects assigned yet.</p>
                  )}
                </div>

                <div className="client-access-section">
                  {members.map((m) => (
                    <div className="member-row" key={m.user_id}>
                      <div className="member-info">
                        <strong>
                          <ShieldCheck size={14} aria-hidden="true" />
                          {allProfiles.find((p) => p.id === m.user_id)
                            ?.full_name || "Client account"}
                        </strong>
                        <small>Joined {date(m.joined_at)}</small>
                      </div>
                      <Form
                        action={removeAccess}
                        submit="Remove access"
                        danger
                        confirm="Remove this person’s access to all projects for this client?"
                      >
                        <Hidden name="client_id" value={client.id} />
                        <Hidden name="user_id" value={m.user_id} />
                      </Form>
                    </div>
                  ))}

                  {!members.length && (
                    <div className="client-invite-controls">
                      <Form
                        action={inviteClient}
                        submit={
                          invitation && !invitation.accepted_at
                            ? "Resend invitation"
                            : "Invite client"
                        }
                      >
                        <Hidden name="client_id" value={client.id} />
                      </Form>
                      {invitation && (
                        <div className="invitation-status">
                          <p>
                            {invitation.revoked_at
                              ? "Invitation revoked."
                              : invitation.accepted_at
                                ? "Previous invitation accepted."
                                : new Date(invitation.expires_at) < now
                                  ? "Invitation expired."
                                  : invitation.email_sent_at
                                    ? "Invitation email requested " +
                                      timestamp(invitation.email_sent_at)
                                    : "Invitation saved; email has not been sent."}
                          </p>
                          {!invitation.accepted_at && !invitation.revoked_at && (
                            <Form
                              action={revokeInvitation}
                              submit="Revoke invitation"
                              danger
                            >
                              <Hidden
                                name="invitation"
                                value={invitation.id}
                              />
                            </Form>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(pagination.hasPrev || pagination.hasNext) && (
        <nav className="pagination" aria-label="Clients pagination">
          {pagination.hasPrev && (
            <Link href={pageHref("/clients", {}, pagination.page - 1)}>
              ← Previous
            </Link>
          )}
          <span className="muted small">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          {pagination.hasNext && (
            <Link href={pageHref("/clients", {}, pagination.page + 1)}>
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

