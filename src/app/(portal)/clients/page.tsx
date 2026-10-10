import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";
import { adminSession, check } from "@/lib/data";
import { PageHeader, Empty } from "@/components/ui";
import { Form, Field, Hidden } from "@/components/forms";
import {
  createClientRecord,
  inviteClient,
  revokeInvitation,
  removeAccess,
} from "@/app/actions";
import { date, timestamp } from "@/lib/utils";
import type { Client, Project, Invitation } from "@/lib/types";
export default async function Clients() {
  const { db } = await adminSession();
  const results = await Promise.all([
    db.from("clients").select("*").order("created_at", { ascending: false }),
    db.from("projects").select("*"),
    db
      .from("invitations")
      .select("*")
      .order("created_at", { ascending: false }),
    db.from("client_members").select("client_id,user_id,joined_at"),
    db.from("profiles").select("id,full_name"),
  ]);
  results.forEach((r) => check(r.error));
  const clients = results[0].data as Client[],
    projects = results[1].data as Project[],
    invites = results[2].data as Invitation[];
  return (
    <>
      <PageHeader
        eyebrow="THE PEOPLE BEHIND THE PROJECTS"
        title="Clients"
        description="Add your client, assign their projects and invite them in."
      />
      <details className="panel create-panel">
        <summary>
          <Users size={18} />
          Add a client<span>+</span>
        </summary>
        <Form action={createClientRecord} submit="Save client" reset>
          <div className="form-grid">
            <Field label="Client name" name="name" maxLength={120} />
            <Field label="Email address" name="email" type="email" />
          </div>
          <Field
            label="Company"
            name="company"
            required={false}
            maxLength={160}
          />
        </Form>
      </details>
      {!clients.length ? (
        <Empty
          title="Your client list starts here."
          description="Add a real client using the form above. No invitation is sent until you choose Invite client."
        />
      ) : (
        <div className="client-grid">
          {clients.map((client) => {
            const assigned = projects.filter((p) => p.client_id === client.id);
            const invitation = invites.find((i) => i.client_id === client.id);
            const members = results[3].data!.filter(
              (m) => m.client_id === client.id,
            );
            return (
              <section className="panel client-card" key={client.id}>
                <div className="client-heading">
                  <span className="avatar large">
                    {client.name[0].toUpperCase()}
                  </span>
                  <div>
                    <h2>{client.name}</h2>
                    <p>{client.company || "Individual client"}</p>
                  </div>
                </div>
                <p className="client-email">{client.email}</p>
                <div className="client-projects">
                  <p className="caption">
                    {assigned.length} ASSIGNED PROJECT
                    {assigned.length === 1 ? "" : "S"}
                  </p>
                  {assigned.length ? (
                    assigned.map((p) => (
                      <Link key={p.id} href={"/projects/" + p.id}>
                        {p.name}
                        {p.archived ? " · Archived" : ""}
                        <ArrowUpRight size={15} />
                      </Link>
                    ))
                  ) : (
                    <p className="muted">No projects assigned yet.</p>
                  )}
                </div>
                {members.map((m) => (
                  <div className="member-row" key={m.user_id}>
                    <span>
                      {results[4].data!.find((p) => p.id === m.user_id)
                        ?.full_name || "Client account"}
                      <small>Joined {date(m.joined_at)}</small>
                    </span>
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
                  <>
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
                              : new Date(invitation.expires_at) < new Date()
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
                            <Hidden name="invitation" value={invitation.id} />
                          </Form>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
