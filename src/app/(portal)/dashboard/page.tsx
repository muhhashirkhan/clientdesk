import Link from "next/link";
import {
  ArrowUpRight,
  FolderKanban,
  Clock3,
  CheckCheck,
  MessageSquare,
  CalendarDays,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Layers,
  Activity,
  BarChart3,
  FolderOpen,
} from "lucide-react";
import { readAllRows } from "@/lib/read-all";
import { session, check } from "@/lib/data";
import { Empty, NewProjectLink, Badge } from "@/components/ui";
import { date, dueLabel, label, progress, timestamp } from "@/lib/utils";
import type {
  Project,
  Milestone,
  Notice,
  Submission,
  Client,
} from "@/lib/types";

type DashboardMilestone = Pick<
  Milestone,
  "id" | "project_id" | "title" | "status" | "due_date" | "created_at"
>;

type ClientSummary = Pick<Client, "id" | "name" | "company">;

function getProjectNextAction(
  project: Project,
  projectMilestones: DashboardMilestone[],
  admin: boolean,
): { text: string; tone: "emerald" | "warning" | "danger" | "muted" } {
  if (project.status === "completed") {
    return { text: "Delivery complete", tone: "emerald" };
  }
  const inReview = projectMilestones.find((m) => m.status === "in_review");
  if (inReview) {
    return {
      text: admin ? "Awaiting client decision" : "Review submitted milestone",
      tone: "warning",
    };
  }
  const changesReq = projectMilestones.find(
    (m) => m.status === "changes_requested",
  );
  if (changesReq) {
    return {
      text: admin ? "Submit revised milestone" : "Revision in progress",
      tone: "danger",
    };
  }
  const planned = projectMilestones.find((m) => m.status === "planned");
  if (planned) {
    return {
      text: admin
        ? `Next: ${planned.title}`
        : `In progress: ${planned.title}`,
      tone: "emerald",
    };
  }
  if (projectMilestones.length > 0) {
    return {
      text: admin ? "Ready to mark complete" : "All milestones approved",
      tone: "emerald",
    };
  }
  return {
    text: admin ? "Add project milestones" : "Open project workspace",
    tone: "muted",
  };
}

export default async function Dashboard() {
  const { db, profile, company, workspaceRole } = await session();
  const admin = workspaceRole !== "client" || profile.role === "admin";

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
      .limit(24),
    Promise.resolve({ data: [], error: null }),
    db
      .from("projects")
      .select("id,name,status,deadline,archived")
      .eq("archived", false)
      .neq("status", "completed")
      .not("deadline", "is", null)
      .order("deadline")
      .limit(5),
    db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("submissions")
      .select("id,milestone_id,project_id,author_name,created_at,status")
      .order("created_at", { ascending: false })
      .limit(12),
    db.from("clients").select("id,name,company"),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    db
      .from("project_tasks")
      .select("id,project_id,title,status,priority,due_date,assignee_name")
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  results.forEach((r) => check(r.error));

  const activeProjectsCount = results[0].count ?? 0;
  const awaitingReviewCount = results[1].count ?? 0;
  const completedProjectsCount = results[2].count ?? 0;
  const changesRequestedCount = results[3].count ?? 0;

  const allProjects = (results[4].data ?? []) as Project[];
  const milestoneResult = allProjects.length
    ? await readAllRows<DashboardMilestone>((from, to) =>
        db
          .from("milestones")
          .select("id,project_id,title,status,due_date,created_at")
          .in(
            "project_id",
            allProjects.map((project) => project.id),
          )
          .order("created_at")
          .order("id")
          .range(from, to),
      )
    : { data: [], error: null };
  check(milestoneResult.error);
  const milestones = milestoneResult.data;
  const deadlines = (results[6].data ?? []) as Project[];
  const notices = (results[7].data ?? []) as Notice[];
  const submissions = (results[8].data ?? []) as Submission[];
  const clients = (results[9].data ?? []) as ClientSummary[];
  const unreadNoticesCount = results[10].count ?? 0;
  const tasks = (results[11].data ?? []) as {
    id: string;
    project_id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    assignee_name: string;
  }[];
  const doneTasksCount = tasks.filter((t) => t.status === "done").length;
  const openTasksCount = tasks.filter((t) => t.status !== "done").length;

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

  // Lookup maps for O(1) relational resolution across authorized records
  const projectById = new Map<string, Project>(
    allProjects.map((p) => [p.id, p]),
  );
  const milestoneById = new Map<string, DashboardMilestone>(
    milestones.map((m) => [m.id, m]),
  );
  const clientById = new Map<string, ClientSummary>(
    clients.map((c) => [c.id, c]),
  );

  // Prioritize active/in-motion projects in Section 3, falling back to recently completed if < 4
  const inMotionProjects = allProjects.filter((p) => p.status !== "completed");
  const recentlyCompletedProjects = allProjects.filter(
    (p) => p.status === "completed",
  );
  const featuredProjects = [
    ...inMotionProjects,
    ...recentlyCompletedProjects,
  ].slice(0, 4);

  const isSingleProject = featuredProjects.length === 1;
  const projectGridMode =
    featuredProjects.length === 1
      ? "is-single"
      : featuredProjects.length === 2
        ? "is-pair"
        : "is-multi";

  // Scope milestones & submissions to non-archived projects for accurate workspace telemetry
  const nonArchivedProjectIds = new Set(allProjects.map((p) => p.id));
  const scopedMilestones = milestones.filter((m) =>
    nonArchivedProjectIds.has(m.project_id),
  );
  const milestoneCounts = {
    approved: scopedMilestones.filter((m) => m.status === "approved").length,
    in_review: scopedMilestones.filter((m) => m.status === "in_review").length,
    changes_requested: scopedMilestones.filter(
      (m) => m.status === "changes_requested",
    ).length,
    planned: scopedMilestones.filter((m) => m.status === "planned").length,
  };
  const totalScopedMilestones = scopedMilestones.length;
  const overallMilestoneRate = totalScopedMilestones
    ? Math.round((milestoneCounts.approved / totalScopedMilestones) * 100)
    : null;

  const projectStatusCounts = {
    active: allProjects.filter((p) => p.status === "active").length,
    draft: allProjects.filter((p) => p.status === "draft").length,
    on_hold: allProjects.filter((p) => p.status === "on_hold").length,
    completed: completedProjectsCount,
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueDeadlinesCount = deadlines.filter(
    (p) => p.deadline && p.deadline < todayIso,
  ).length;

  // Actionable items for Section 4 (Pending Submissions & Requested Changes on active projects)
  const pendingSubmissionsList = submissions
    .filter((s) => {
      const proj = projectById.get(s.project_id);
      return (
        s.status === "pending" &&
        proj &&
        !proj.archived &&
        proj.status !== "completed"
      );
    })
    .slice(0, 4);

  const requestedChangesList = scopedMilestones
    .filter((m) => {
      const proj = projectById.get(m.project_id);
      return (
        m.status === "changes_requested" &&
        proj &&
        !proj.archived &&
        proj.status !== "completed"
      );
    })
    .slice(0, 4);

  const totalAttentionCount = awaitingReviewCount + changesRequestedCount;

  const stats = [
    {
      label: "Active projects",
      count: activeProjectsCount,
      icon: FolderKanban,
      detail: "Currently in your workspace",
      meta:
        milestoneCounts.in_review + milestoneCounts.planned > 0
          ? `${milestoneCounts.in_review + milestoneCounts.planned} milestone${milestoneCounts.in_review + milestoneCounts.planned === 1 ? "" : "s"} in motion`
          : "All active schedules tracked",
      href: "/projects?status=active",
      tone: "emerald" as const,
    },
    {
      label: admin ? "Awaiting client review" : "Waiting for your review",
      count: awaitingReviewCount,
      icon: Clock3,
      detail: "Submitted work to approve",
      meta:
        awaitingReviewCount > 0
          ? admin
            ? "Pending client decision"
            : "Ready for your decision"
          : "Approval queue clear",
      href: "/approvals",
      tone: awaitingReviewCount > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Completed projects",
      count: completedProjectsCount,
      icon: CheckCheck,
      detail: "Projects marked complete",
      meta: `${milestoneCounts.approved} milestone${milestoneCounts.approved === 1 ? "" : "s"} approved overall`,
      href: "/projects?status=completed",
      tone: "lime" as const,
    },
    {
      label: admin ? "Changes requested" : "Your change requests",
      count: changesRequestedCount,
      icon: MessageSquare,
      detail: "Milestones needing another pass",
      meta:
        changesRequestedCount > 0
          ? "Revisions prioritized"
          : "No active revision blockers",
      href: "/approvals",
      tone:
        changesRequestedCount > 0 ? ("danger" as const) : ("neutral" as const),
    },
  ];

  const firstName = profile.full_name
    ? profile.full_name.trim().split(/\s+/)[0]
    : "";

  return (
    <div className="command-center">
      {/* SECTION 1 — COMMAND HEADER */}
      <header className="page-heading command-header obsidian-panel">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">
              {company?.name
                ? `${company.name.toUpperCase()} · ${workspaceRole.toUpperCase()} WORKSPACE`
                : "YOUR WORKSPACE, AT A GLANCE"}
            </p>
          </div>
          <h1>
            {`Hello${firstName ? ", " + firstName : ""}. Let’s move things forward.`}
          </h1>
          <p className="muted">
            {admin
              ? "A clear picture of every project, team velocity, and what needs your attention."
              : `Your projects, next steps and conversations with ${company?.name || "Aiquor"}.`}
          </p>
          <div className="command-summary-pills" aria-label="Workspace summary">
            <Link href="/projects" className="command-summary-pill">
              <FolderKanban size={13} aria-hidden="true" />
              <span>
                <strong>{activeProjectsCount}</strong> active{" "}
                {activeProjectsCount === 1 ? "project" : "projects"}
              </span>
            </Link>
            <Link
              href="/approvals"
              className={`command-summary-pill ${totalAttentionCount > 0 ? "is-attention" : "is-clear"}`}
            >
              {totalAttentionCount > 0 ? (
                <>
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>
                    <strong>{totalAttentionCount}</strong>{" "}
                    {totalAttentionCount === 1
                      ? "item needs attention"
                      : "items need attention"}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} aria-hidden="true" />
                  <span>Review queue clear</span>
                </>
              )}
            </Link>
            {tasks.length > 0 && (
              <Link href="/projects" className="command-summary-pill">
                <CheckCheck size={13} aria-hidden="true" />
                <span>
                  <strong>{doneTasksCount}</strong>/{tasks.length} tasks done
                </span>
              </Link>
            )}
            {company &&
              !company.onboarding_completed &&
              (workspaceRole === "owner" || workspaceRole === "admin") && (
                <Link
                  href="/onboarding"
                  className="command-summary-pill is-attention"
                >
                  <Sparkles size={13} aria-hidden="true" />
                  <span>Complete workspace setup →</span>
                </Link>
              )}
            {unreadNoticesCount > 0 && (
              <Link
                href="/notifications"
                className="command-summary-pill is-unread"
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>
                  <strong>{unreadNoticesCount}</strong> unread{" "}
                  {unreadNoticesCount === 1 ? "update" : "updates"}
                </span>
              </Link>
            )}
          </div>
        </div>
        <div className="command-header-actions">
          {admin ? (
            <>
              <NewProjectLink />
              <Link
                href="/approvals"
                className="button secondary glass-button"
              >
                Approvals
                {awaitingReviewCount > 0 && (
                  <span className="command-action-count">
                    {awaitingReviewCount}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link href="/approvals" className="button primary glass-button">
                Review approvals
                {awaitingReviewCount > 0 && (
                  <span className="command-action-count">
                    {awaitingReviewCount}
                  </span>
                )}
              </Link>
              <Link href="/projects" className="button secondary glass-button">
                All projects
              </Link>
            </>
          )}
        </div>
      </header>

      {/* PENDING CLIENT INVITATION CALLOUT */}
      {!!pending?.data?.length && (
        <section
          className="panel command-invite-banner glass-container"
          aria-labelledby="invite-banner-heading"
        >
          <div className="command-invite-copy">
            <p className="eyebrow">ACTION REQUIRED</p>
            <h2 id="invite-banner-heading">Finish your invitation</h2>
            <p>
              Aiquor has invited you to access assigned projects. Complete your
              account setup to open them.
            </p>
          </div>
          <div className="command-invite-actions">
            {(pending.data as { id: string }[]).map((invitation) => (
              <Link
                key={invitation.id}
                className="button primary glass-button"
                href={"/accept-invitation?invitation=" + invitation.id}
              >
                Accept invitation <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2 — KPI OVERVIEW */}
      <section aria-label="Key performance indicators">
        <div className="stats-grid command-kpi-grid">
          {stats.map(({ label: kpiLabel, count, icon: Icon, detail, meta, href, tone }) => (
            <Link
              href={href}
              className={`stat-card command-kpi-card tone-${tone} glass-container`}
              key={kpiLabel}
            >
              <div className="command-kpi-top">
                <span>{kpiLabel}</span>
                <span className="command-kpi-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
              </div>
              <strong>{count ?? 0}</strong>
              <p>{detail}</p>
              <div className="command-kpi-footer">
                <span className="command-kpi-meta">{meta}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ASYMMETRIC BENTO COMMAND WORKSPACE */}
      <div className="command-bento-grid">
        {/* PRIMARY COLUMN: ACTIVE PROJECTS (SECTION 3) + DELIVERY TELEMETRY (SECTION 6) */}
        <div className="command-bento-primary">
          {/* SECTION 3 — ACTIVE PROJECTS */}
          <section
            className="command-projects-section"
            aria-labelledby="active-projects-heading"
          >
            <div className="section-heading command-section-heading">
              <div>
                <p className="eyebrow">WORK IN MOTION</p>
                <div className="command-heading-title-row">
                  <h2 id="active-projects-heading">Your projects</h2>
                  <span className="command-count-pill">
                    {allProjects.length}
                  </span>
                </div>
              </div>
              <Link className="text-link" href="/projects">
                View all projects <ArrowUpRight size={16} />
              </Link>
            </div>

            {featuredProjects.length ? (
              <div
                className={`project-grid command-project-grid ${projectGridMode}`}
                data-project-count={featuredProjects.length}
              >
                {featuredProjects.map((p) => {
                  const projectMilestones = milestones.filter(
                    (m) => m.project_id === p.id,
                  );
                  const hasMilestones = projectMilestones.length > 0;
                  const approvedCount = projectMilestones.filter(
                    (m) => m.status === "approved",
                  ).length;
                  const inReviewCount = projectMilestones.filter(
                    (m) => m.status === "in_review",
                  ).length;
                  const remainingCount = Math.max(
                    0,
                    projectMilestones.length - approvedCount,
                  );
                  const pct = hasMilestones ? progress(projectMilestones) : null;
                  const clientInfo = clientById.get(p.client_id);
                  const clientDisplay =
                    clientInfo?.company ||
                    clientInfo?.name ||
                    (admin ? "CLIENT WORKSPACE" : "YOUR PROJECT");
                  const nextAction = getProjectNextAction(
                    p,
                    projectMilestones,
                    admin,
                  );
                  const currentMilestone =
                    projectMilestones.find(
                      (m) => m.status === "changes_requested",
                    ) ||
                    projectMilestones.find((m) => m.status === "in_review") ||
                    projectMilestones.find((m) => m.status === "planned") ||
                    projectMilestones[projectMilestones.length - 1];

                  return (
                    <Link
                      key={p.id}
                      href={"/projects/" + p.id}
                      className={`project-card command-project-card glass-container ${isSingleProject ? "is-featured-single" : ""}`}
                    >
                      <div className="command-project-main">
                        <div className="card-top">
                          <div className="command-project-brand">
                            <span className="project-symbol glass-container-circle glass-container">
                              <FolderOpen size={18} aria-hidden="true" />
                            </span>
                            <div className="command-project-brand-meta">
                              <p className="caption">{clientDisplay}</p>
                              {isSingleProject && (
                                <span className="command-featured-tag">
                                  Active workspace
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge value={p.archived ? "archived" : p.status} />
                        </div>

                        <h2>{p.name}</h2>
                        <p className="scope-preview">
                          {p.scope || "Scope has not been added yet."}
                        </p>

                        <footer className="command-project-footer">
                          <span className="command-project-due">
                            <CalendarDays size={13} aria-hidden="true" />
                            {dueLabel(p.deadline)}
                          </span>
                          <span
                            className={`command-next-action tone-${nextAction.tone}`}
                          >
                            {nextAction.text}
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </span>
                        </footer>
                      </div>

                      {hasMilestones && pct !== null ? (
                        <div className="command-project-progress">
                          <div className="progress-label">
                            <span>
                              {`${approvedCount} of ${projectMilestones.length} milestone${projectMilestones.length === 1 ? "" : "s"} approved`}
                            </span>
                            <strong>{pct}%</strong>
                          </div>
                          <div
                            className="progress-track"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${p.name} milestone completion`}
                          >
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          {currentMilestone && (
                            <div className="command-milestone-chip">
                              <span className="command-milestone-chip-label">
                                {currentMilestone.title}
                              </span>
                              <span
                                className={`command-milestone-chip-status status-${currentMilestone.status}`}
                              >
                                {label(currentMilestone.status)}
                              </span>
                            </div>
                          )}
                          {isSingleProject && (
                            <div className="command-single-project-metrics">
                              <div>
                                <span>Approved</span>
                                <strong>{approvedCount}</strong>
                              </div>
                              <div>
                                <span>In review</span>
                                <strong>{inReviewCount}</strong>
                              </div>
                              <div>
                                <span>Remaining</span>
                                <strong>{remainingCount}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="command-project-progress is-unscheduled">
                          <div className="progress-label">
                            <span>Milestone schedule</span>
                            <span className="command-status-text">
                              {label(p.status)}
                            </span>
                          </div>
                          <div className="progress-track is-empty">
                            <span style={{ width: "0%" }} />
                          </div>
                          <div className="command-milestone-chip">
                            <span className="command-milestone-chip-label">
                              {admin
                                ? "Add milestones in workspace to track progress"
                                : "Milestone schedule in preparation"}
                            </span>
                          </div>
                          {isSingleProject && (
                            <div className="command-single-project-metrics">
                              <div>
                                <span>Status</span>
                                <strong>{label(p.status)}</strong>
                              </div>
                              <div>
                                <span>Target</span>
                                <strong>{date(p.deadline)}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })}
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
          </section>

          {/* SECTION 6 — ANALYTICS & DELIVERY TELEMETRY */}
          <section
            className="panel command-analytics-panel glass-container"
            aria-labelledby="analytics-heading"
          >
            <div className="section-heading compact command-panel-header">
              <div>
                <p className="eyebrow">DELIVERY TELEMETRY</p>
                <h2 id="analytics-heading">
                  <BarChart3 size={18} aria-hidden="true" />
                  Milestone &amp; portfolio breakdown
                </h2>
              </div>
              <span className="command-telemetry-tag">
                {totalScopedMilestones > 0
                  ? `${totalScopedMilestones} milestone${totalScopedMilestones === 1 ? "" : "s"} tracked`
                  : "Live workspace data"}
              </span>
            </div>

            {totalScopedMilestones > 0 || allProjects.length > 0 ? (
              <div className="command-analytics-body">
                {/* Milestone Distribution Bar & Breakdown */}
                <div className="command-distribution-block">
                  <div className="command-distribution-header">
                    <div>
                      <span className="command-distribution-label">
                        Milestone approval ratio
                      </span>
                      <p className="command-distribution-sub">
                        {totalScopedMilestones > 0
                          ? `${milestoneCounts.approved} approved out of ${totalScopedMilestones} total milestones across active & completed projects`
                          : "No milestones have been created across your projects yet."}
                      </p>
                    </div>
                    <strong className="command-distribution-rate">
                      {overallMilestoneRate !== null
                        ? `${overallMilestoneRate}%`
                        : "—"}
                    </strong>
                  </div>

                  <div
                    className="command-segmented-bar"
                    role="img"
                    aria-label={
                      totalScopedMilestones > 0
                        ? `Milestone distribution: ${milestoneCounts.approved} approved, ${milestoneCounts.in_review} in review, ${milestoneCounts.changes_requested} changes requested, ${milestoneCounts.planned} planned`
                        : "No milestones recorded"
                    }
                  >
                    {totalScopedMilestones > 0 ? (
                      <>
                        {milestoneCounts.approved > 0 && (
                          <span
                            className="seg-approved"
                            style={{
                              width: `${(milestoneCounts.approved / totalScopedMilestones) * 100}%`,
                            }}
                          />
                        )}
                        {milestoneCounts.in_review > 0 && (
                          <span
                            className="seg-review"
                            style={{
                              width: `${(milestoneCounts.in_review / totalScopedMilestones) * 100}%`,
                            }}
                          />
                        )}
                        {milestoneCounts.changes_requested > 0 && (
                          <span
                            className="seg-changes"
                            style={{
                              width: `${(milestoneCounts.changes_requested / totalScopedMilestones) * 100}%`,
                            }}
                          />
                        )}
                        {milestoneCounts.planned > 0 && (
                          <span
                            className="seg-planned"
                            style={{
                              width: `${(milestoneCounts.planned / totalScopedMilestones) * 100}%`,
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <span className="seg-empty" style={{ width: "100%" }} />
                    )}
                  </div>

                  <div className="command-legend-grid">
                    <div className="command-legend-item">
                      <span className="legend-label">
                        <i className="legend-dot approved" />
                        Approved
                      </span>
                      <div className="command-legend-value">
                        <strong>{milestoneCounts.approved}</strong>
                        {totalScopedMilestones > 0 && (
                          <small>
                            {Math.round(
                              (milestoneCounts.approved /
                                totalScopedMilestones) *
                                100,
                            )}
                            %
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="command-legend-item">
                      <span className="legend-label">
                        <i className="legend-dot review" />
                        In review
                      </span>
                      <div className="command-legend-value">
                        <strong>{milestoneCounts.in_review}</strong>
                        {totalScopedMilestones > 0 && (
                          <small>
                            {Math.round(
                              (milestoneCounts.in_review /
                                totalScopedMilestones) *
                                100,
                            )}
                            %
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="command-legend-item">
                      <span className="legend-label">
                        <i className="legend-dot changes" />
                        Changes requested
                      </span>
                      <div className="command-legend-value">
                        <strong>{milestoneCounts.changes_requested}</strong>
                        {totalScopedMilestones > 0 && (
                          <small>
                            {Math.round(
                              (milestoneCounts.changes_requested /
                                totalScopedMilestones) *
                                100,
                            )}
                            %
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="command-legend-item">
                      <span className="legend-label">
                        <i className="legend-dot planned" />
                        Planned
                      </span>
                      <div className="command-legend-value">
                        <strong>{milestoneCounts.planned}</strong>
                        {totalScopedMilestones > 0 && (
                          <small>
                            {Math.round(
                              (milestoneCounts.planned /
                                totalScopedMilestones) *
                                100,
                            )}
                            %
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Portfolio Status & Schedule Summary Strip */}
                <div className="command-portfolio-strip">
                  <div className="command-portfolio-cell">
                    <span className="portfolio-cell-label">
                      <Layers size={14} aria-hidden="true" />
                      Portfolio status
                    </span>
                    <div className="portfolio-cell-pills">
                      <span>
                        <strong>{projectStatusCounts.active}</strong> Active
                      </span>
                      <span>
                        <strong>{projectStatusCounts.draft}</strong> Draft
                      </span>
                      <span>
                        <strong>{projectStatusCounts.on_hold}</strong> On hold
                      </span>
                      <span>
                        <strong>{projectStatusCounts.completed}</strong> Done
                      </span>
                    </div>
                  </div>

                  <div className="command-portfolio-cell">
                    <span className="portfolio-cell-label">
                      <CalendarDays size={14} aria-hidden="true" />
                      Deadline &amp; task velocity
                    </span>
                    <div className="portfolio-cell-pills">
                      <span>
                        <strong>{deadlines.length}</strong> Scheduled
                      </span>
                      <span
                        className={
                          overdueDeadlinesCount > 0 ? "text-danger" : ""
                        }
                      >
                        <strong>{overdueDeadlinesCount}</strong> Overdue
                      </span>
                      <span>
                        <strong>{doneTasksCount}</strong> Tasks done
                      </span>
                      <span>
                        <strong>{openTasksCount}</strong> Open tasks
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="command-caught-up compact">
                <p className="quiet-empty">
                  Delivery analytics will populate automatically once your first
                  project and milestones are created.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* SECONDARY COLUMN: ACTION REQUIRED (SECTION 4) + RECENT ACTIVITY (SECTION 5) */}
        <aside
          className="command-bento-secondary"
          aria-label="Action queue and activity timeline"
        >
          {/* SECTION 4 — ACTION REQUIRED */}
          <section
            className="panel command-action-panel glass-container"
            aria-labelledby="action-required-heading"
          >
            <div className="section-heading compact command-panel-header">
              <div>
                <p className="eyebrow">PRIORITY QUEUE</p>
                <h2 id="action-required-heading">
                  <Clock3 size={18} aria-hidden="true" />
                  Action required
                </h2>
              </div>
              <Link href="/approvals" className="text-link">
                Approvals <ArrowUpRight size={15} />
              </Link>
            </div>

            {pendingSubmissionsList.length > 0 ||
            requestedChangesList.length > 0 ||
            deadlines.length > 0 ? (
              <div className="command-action-groups">
                {/* Pending Submissions Awaiting Review */}
                {pendingSubmissionsList.length > 0 && (
                  <div className="command-action-group">
                    <p className="command-group-label">
                      {admin
                        ? "Awaiting client decision"
                        : "Waiting for your review"}
                    </p>
                    {pendingSubmissionsList.map((s) => {
                      const proj = projectById.get(s.project_id);
                      const ms = milestoneById.get(s.milestone_id);
                      return (
                        <Link
                          key={s.id}
                          href="/approvals"
                          className="list-row command-action-row tone-warning"
                        >
                          <div className="command-action-row-body">
                            <strong>{ms?.title || "Milestone review"}</strong>
                            <small>
                              {proj ? `${proj.name} · ` : ""}
                              Submitted by {s.author_name} · {date(s.created_at)}
                            </small>
                          </div>
                          <Badge value="in_review" />
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Milestones With Requested Changes */}
                {requestedChangesList.length > 0 && (
                  <div className="command-action-group">
                    <p className="command-group-label">Changes requested</p>
                    {requestedChangesList.map((m) => {
                      const proj = projectById.get(m.project_id);
                      return (
                        <Link
                          key={m.id}
                          href={`/projects/${m.project_id}?tab=milestones`}
                          className="list-row command-action-row tone-danger"
                        >
                          <div className="command-action-row-body">
                            <strong>{m.title}</strong>
                            <small>
                              {proj ? `${proj.name} · ` : ""}
                              {m.due_date
                                ? `Due ${date(m.due_date)}`
                                : "Revision needed"}
                            </small>
                          </div>
                          <Badge value="changes_requested" />
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Upcoming & Overdue Deadlines */}
                <div className="command-action-group">
                  <p className="command-group-label">Upcoming deadlines</p>
                  {deadlines.length > 0 ? (
                    deadlines.map((p) => {
                      const isOverdue = p.deadline! < todayIso;
                      return (
                        <Link
                          key={p.id}
                          className={`list-row command-action-row ${isOverdue ? "tone-danger" : "tone-neutral"}`}
                          href={"/projects/" + p.id}
                        >
                          <div className="command-action-row-body">
                            <strong>{p.name}</strong>
                            <small>
                              {isOverdue ? "Overdue · " : "Target · "}
                              {date(p.deadline)}
                            </small>
                          </div>
                          <Badge value={isOverdue ? "overdue" : p.status} />
                        </Link>
                      );
                    })
                  ) : (
                    <p className="command-inline-empty">
                      No upcoming project deadlines scheduled.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="command-caught-up">
                <span className="command-caught-up-icon">
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>
                <h3>All caught up</h3>
                <p>
                  No pending approvals, requested revisions, or upcoming
                  deadlines require your attention right now.
                </p>
              </div>
            )}
          </section>

          {/* SECTION 5 — RECENT ACTIVITY */}
          <section
            className="panel command-activity-panel glass-container"
            aria-labelledby="recent-activity-heading"
          >
            <div className="section-heading compact command-panel-header">
              <div>
                <p className="eyebrow">LIVE TIMELINE</p>
                <div className="command-heading-title-row">
                  <h2 id="recent-activity-heading">
                    <Activity size={18} aria-hidden="true" />
                    Latest updates
                  </h2>
                  {unreadNoticesCount > 0 && (
                    <span
                      className="command-activity-unread-pill"
                      aria-label={`${unreadNoticesCount} unread notifications`}
                    >
                      {unreadNoticesCount} unread
                    </span>
                  )}
                </div>
              </div>
              <Link href="/notifications" className="text-link">
                View all <ArrowUpRight size={15} />
              </Link>
            </div>

            {notices.length > 0 ? (
              <div className="command-activity-timeline" role="list">
                {notices.map((n) => {
                  const assocProject = n.project_id
                    ? projectById.get(n.project_id)
                    : undefined;
                  const unread = !n.read_at;
                  const KindIcon =
                    n.kind === "decision"
                      ? CheckCheck
                      : n.kind === "review"
                        ? Clock3
                        : MessageSquare;

                  return (
                    <Link
                      className={`list-row command-activity-item ${unread ? "is-unread" : "is-read"}`}
                      key={n.id}
                      href={
                        n.project_id
                          ? "/projects/" + n.project_id
                          : n.kind === "invitation"
                            ? "/settings"
                            : "/projects"
                      }
                      role="listitem"
                    >
                      <span
                        className={`command-activity-node kind-${n.kind}`}
                        aria-hidden="true"
                      >
                        <KindIcon size={13} />
                      </span>
                      <div className="command-activity-body">
                        <div className="command-activity-meta-top">
                          <div className="command-activity-meta-left">
                            {unread && (
                              <span
                                className="command-unread-dot"
                                title="Unread notification"
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={`command-activity-kind kind-${n.kind}`}
                            >
                              {label(n.kind)}
                            </span>
                            {assocProject && (
                              <span className="command-activity-project">
                                {assocProject.name}
                              </span>
                            )}
                          </div>
                          <time
                            className="command-activity-time"
                            dateTime={n.created_at}
                          >
                            {timestamp(n.created_at)}
                          </time>
                        </div>
                        <p className="command-activity-message">{n.message}</p>
                      </div>
                      <ArrowUpRight
                        size={14}
                        className="command-activity-arrow"
                        aria-hidden="true"
                      />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="command-caught-up compact">
                <p className="quiet-empty">
                  All quiet for now. Comments, milestone submissions, and review
                  decisions will appear here.
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

