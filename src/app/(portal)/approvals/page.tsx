import Link from "next/link";
import {
  CheckCheck,
  Clock3,
  AlertTriangle,
  FileCheck2,
  FolderKanban,
} from "lucide-react";
import { session, check } from "@/lib/data";
import { Empty, Badge } from "@/components/ui";
import { ReviewCard } from "@/components/review-card";
import { parsePage, pageHref } from "@/lib/utils";
import type { Submission, Decision, Milestone, Project } from "@/lib/types";

const APPROVALS_PAGE_SIZE = 24;

const reviewFilters: { value: string; label: string }[] = [
  { value: "", label: "All reviews" },
  { value: "pending", label: "Pending review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
];

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: rawStatus, page: rawPage } = await searchParams;
  const currentStatus = ["pending", "changes_requested", "approved"].includes(
    rawStatus || "",
  )
    ? rawStatus!
    : "";

  const { db, profile } = await session();
  const admin = profile.role === "admin";

  const [pendingExact, approvedExact, changesExact] = await Promise.all([
    db
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    db
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "changes_requested"),
  ]);
  check(pendingExact.error);
  check(approvedExact.error);
  check(changesExact.error);

  const pendingCount = pendingExact.count ?? 0;
  const approvedCount = approvedExact.count ?? 0;
  const changesCount = changesExact.count ?? 0;
  const totalSubmissionsCount = pendingCount + approvedCount + changesCount;

  const filteredTotalCount =
    currentStatus === "pending"
      ? pendingCount
      : currentStatus === "approved"
        ? approvedCount
        : currentStatus === "changes_requested"
          ? changesCount
          : totalSubmissionsCount;

  const pagination = parsePage(
    rawPage,
    filteredTotalCount,
    APPROVALS_PAGE_SIZE,
  );

  let submissionsQuery = db
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (currentStatus) {
    submissionsQuery = submissionsQuery.eq("status", currentStatus);
  }
  const submissionsRes = await submissionsQuery.range(
    pagination.from,
    pagination.to,
  );
  check(submissionsRes.error);

  const submissions = (submissionsRes.data ?? []) as Submission[];
  const submissionIds = submissions.map((s) => s.id);
  const milestoneIds = [...new Set(submissions.map((s) => s.milestone_id))];
  const projectIds = [...new Set(submissions.map((s) => s.project_id))];

  const [decisionsRes, milestonesRes, projectsRes] = await Promise.all([
    submissionIds.length
      ? db
          .from("decisions")
          .select("*")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    milestoneIds.length
      ? db.from("milestones").select("id,title").in("id", milestoneIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? db
          .from("projects")
          .select("id,name,status,archived")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  check(decisionsRes.error);
  check(milestonesRes.error);
  check(projectsRes.error);

  const decisions = (decisionsRes.data ?? []) as Decision[];
  const milestones = (milestonesRes.data ?? []) as Pick<
    Milestone,
    "id" | "title"
  >[];
  const projects = (projectsRes.data ?? []) as Pick<
    Project,
    "id" | "name" | "status" | "archived"
  >[];

  const decisionBySubId = new Map(decisions.map((d) => [d.submission_id, d]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const filteredSubmissions = submissions;
  const pendingItems = filteredSubmissions.filter(
    (s) => s.status === "pending",
  );
  const historyItems = filteredSubmissions.filter(
    (s) => s.status !== "pending",
  );

  const renderCard = (s: Submission) => {
    const p = projectById.get(s.project_id);
    return (
      <ReviewCard
        key={s.id}
        submission={s}
        decision={decisionBySubId.get(s.id)}
        title={milestoneById.get(s.milestone_id)?.title || "Milestone"}
        projectName={p?.name}
        admin={admin}
        readOnly={p?.archived || p?.status === "completed"}
      />
    );
  };

  return (
    <div className="approvals-workspace">
      <header className="command-header page-heading approvals-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">FEEDBACK THAT MOVES WORK FORWARD</p>
            <Badge
              value={
                pendingCount > 0
                  ? "in_review"
                  : currentStatus || "approved"
              }
            />
          </div>
          <h1>Approvals</h1>
          <p className="muted">
            {admin
              ? "Track submitted deliverables, client decisions and requested changes across all workspaces."
              : "Review submitted deliverables, approve completed work or request specific adjustments."}
          </p>

          <div
            className="command-summary-pills"
            aria-label="Approvals queue summary"
          >
            <span
              className={`command-summary-pill ${
                pendingCount > 0 ? "is-attention" : ""
              }`}
            >
              <Clock3 size={13} aria-hidden="true" />
              <span>
                <strong>{pendingCount}</strong> pending review
              </span>
            </span>

            <span className="command-summary-pill is-clear">
              <CheckCheck size={13} aria-hidden="true" />
              <span>
                <strong>{approvedCount}</strong> approved
              </span>
            </span>

            {changesCount > 0 && (
              <span className="command-summary-pill">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>
                  <strong>{changesCount}</strong> changes requested
                </span>
              </span>
            )}

            <span className="command-summary-pill">
              <FileCheck2 size={13} aria-hidden="true" />
              <span>
                <strong>{totalSubmissionsCount}</strong> total submission
                {totalSubmissionsCount === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        </div>

        <div className="command-header-actions">
          <Link href="/projects" className="button secondary glass-button">
            <FolderKanban size={16} aria-hidden="true" />
            All projects
          </Link>
        </div>
      </header>

      {totalSubmissionsCount > 0 && (
        <section
          className="projects-discovery-panel approvals-filter-panel glass-container"
          aria-label="Filter review submissions"
        >
          <div className="projects-filter-pills-row is-single-row">
            <div
              className="projects-status-pills"
              role="navigation"
              aria-label="Review status filters"
            >
              {reviewFilters.map((item) => {
                const active = currentStatus === item.value;
                const count =
                  item.value === ""
                    ? totalSubmissionsCount
                    : item.value === "pending"
                      ? pendingCount
                      : item.value === "approved"
                        ? approvedCount
                        : changesCount;
                const href = item.value
                  ? `/approvals?status=${item.value}`
                  : "/approvals";

                return (
                  <Link
                    key={item.value || "all"}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`projects-filter-pill glass-button ${
                      active ? "is-active" : ""
                    }`}
                  >
                    <span>{item.label}</span>
                    <small className="filter-pill-count">{count}</small>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {filteredSubmissions.length ? (
        !currentStatus && pendingItems.length > 0 && historyItems.length > 0 ? (
          <div className="approvals-sections">
            <section
              className="approvals-group"
              aria-labelledby="pending-reviews-heading"
            >
              <div className="approvals-group-header">
                <h2 id="pending-reviews-heading">
                  Awaiting decision ({pendingItems.length})
                </h2>
                <p className="muted small">
                  Submissions currently open for client review.
                </p>
              </div>
              <div className="review-list">{pendingItems.map(renderCard)}</div>
            </section>

            <section
              className="approvals-group"
              aria-labelledby="decision-history-heading"
            >
              <div className="approvals-group-header">
                <h2 id="decision-history-heading">
                  Recorded decision history ({historyItems.length})
                </h2>
                <p className="muted small">
                  Immutable audit log of approved deliverables and change
                  requests.
                </p>
              </div>
              <div className="review-list">{historyItems.map(renderCard)}</div>
            </section>
          </div>
        ) : (
          <div className="review-list">
            {filteredSubmissions.map(renderCard)}
          </div>
        )
      ) : totalSubmissionsCount > 0 ? (
        <Empty
          title={
            currentStatus === "pending"
              ? "Nothing waiting for review right now."
              : `No ${currentStatus.replace("_", " ")} submissions.`
          }
          description="Switch back to all reviews to inspect the full submission and decision history."
          href="/approvals"
          action="Show all reviews"
        />
      ) : (
        <Empty
          title="Nothing waiting for review."
          description="Submitted milestones will appear here with the work, feedback and approval history."
          href="/projects"
          action="View projects"
        />
      )}

      {(pagination.hasPrev || pagination.hasNext) && (
        <nav className="pagination" aria-label="Approvals pagination">
          {pagination.hasPrev && (
            <Link
              href={pageHref(
                "/approvals",
                { status: currentStatus || undefined },
                pagination.page - 1,
              )}
            >
              ← Previous
            </Link>
          )}
          <span className="muted small">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          {pagination.hasNext && (
            <Link
              href={pageHref(
                "/approvals",
                { status: currentStatus || undefined },
                pagination.page + 1,
              )}
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

