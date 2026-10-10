import Link from "next/link";
import {
  ArrowUpRight,
  FolderKanban,
  Clock3,
  CheckCheck,
  MessageSquare,
  CalendarDays,
} from "lucide-react";
import { session, check } from "@/lib/data";
import {
  PageHeader,
  Empty,
  ProjectCard,
  NewProjectLink,
  Badge,
} from "@/components/ui";
import { date } from "@/lib/utils";
import type { Project, Milestone, Notice } from "@/lib/types";
export default async function Dashboard() {
  const { db, profile } = await session();
  const admin = profile.role === "admin";
  const results = await Promise.all([
    db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .neq("status", "completed"),
    db
      .from("submissions")
      .select("id,projects!inner(archived,status)", {
        count: "exact",
        head: true,
      })
      .eq("status", "pending")
      .eq("projects.archived", false)
      .neq("projects.status", "completed"),
    db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("archived", false),
    db
      .from("milestones")
      .select("id,projects!inner(archived,status)", {
        count: "exact",
        head: true,
      })
      .eq("status", "changes_requested")
      .eq("projects.archived", false)
      .neq("projects.status", "completed"),
    db
      .from("projects")
      .select("*")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(4),
    db.from("milestones").select("*"),
    db
      .from("projects")
      .select("*")
      .eq("archived", false)
      .neq("status", "completed")
      .not("deadline", "is", null)
      .order("deadline")
      .limit(5),
    db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  results.forEach((r) => check(r.error));
  const projects = results[4].data as Project[],
    milestones = results[5].data as Milestone[],
    deadlines = results[6].data as Project[],
    notices = results[7].data as Notice[];
  const pending = admin
    ? null
    : await db
        .from("invitations")
        .select("id")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
  if (pending) check(pending.error);
  const stats = [
    {
      label: "Active projects",
      count: results[0].count,
      icon: FolderKanban,
      detail: "Currently in your workspace",
    },
    {
      label: admin ? "Awaiting client review" : "Waiting for your review",
      count: results[1].count,
      icon: Clock3,
      detail: "Submitted work to approve",
    },
    {
      label: "Completed projects",
      count: results[2].count,
      icon: CheckCheck,
      detail: "Projects marked complete",
    },
    {
      label: admin ? "Changes requested" : "Your change requests",
      count: results[3].count,
      icon: MessageSquare,
      detail: "Milestones needing another pass",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title={`Hello${profile.full_name ? ", " + profile.full_name.split(" ")[0] : ""}. Let’s move things forward.`}
        description={
          admin
            ? "A clear picture of every project and what needs your attention."
            : "Your projects, next steps and conversations with Aiquor."
        }
        action={admin ? <NewProjectLink /> : undefined}
      />
      {!!pending?.data?.length && (
        <section className="panel">
          <h2>Finish your invitation</h2>
          <p>
            Aiquor has invited you to access assigned projects. Complete your
            account setup to open them.
          </p>
          {pending.data.map((invitation) => (
            <Link
              key={invitation.id}
              className="button primary"
              href={"/accept-invitation?invitation=" + invitation.id}
            >
              Accept invitation <ArrowUpRight size={16} />
            </Link>
          ))}
        </section>
      )}
      <div className="stats-grid">
        {stats.map(({ label, count, icon: Icon, detail }) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{count ?? 0}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">WORK IN MOTION</p>
          <h2>Your projects</h2>
        </div>
        <Link className="text-link" href="/projects">
          View all projects <ArrowUpRight size={16} />
        </Link>
      </div>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              milestones={milestones.filter((m) => m.project_id === p.id)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={
            admin
              ? "Your next project starts here."
              : "Your workspace is ready."
          }
          description={
            admin
              ? "Add a client, create a project, and invite them to work with you."
              : "When Aiquor assigns your first project, its details will appear here."
          }
          href={admin ? "/clients" : undefined}
          action="Add your first client"
        />
      )}
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="section-heading compact">
            <h2>
              <CalendarDays size={18} />
              Upcoming deadlines
            </h2>
          </div>
          {deadlines.length ? (
            deadlines.map((p) => (
              <Link key={p.id} className="list-row" href={"/projects/" + p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <small>{date(p.deadline)}</small>
                </div>
                <Badge
                  value={
                    p.deadline! < new Date().toISOString().slice(0, 10)
                      ? "overdue"
                      : p.status
                  }
                />
              </Link>
            ))
          ) : (
            <p className="quiet-empty">
              No deadlines yet. Project dates will appear here.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading compact">
            <h2>Latest updates</h2>
            <Link href="/notifications" className="text-link">
              View all
            </Link>
          </div>
          {notices.length ? (
            notices.map((n) => (
              <Link
                className="list-row"
                key={n.id}
                href={"/projects/" + n.project_id}
              >
                <div>
                  <strong>{n.message}</strong>
                  <small>{date(n.created_at)}</small>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))
          ) : (
            <p className="quiet-empty">
              All quiet for now. Comments and review activity will appear here.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
