import Link from "next/link";
import {
  Search,
  FolderKanban,
  CheckCheck,
  RotateCcw,
} from "lucide-react";
import { session, check } from "@/lib/data";
import {
  Empty,
  ProjectCard,
  NewProjectLink,
  Badge,
} from "@/components/ui";
import type { Project, Milestone, Client } from "@/lib/types";

const statusFilters: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
];

export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    archived?: string;
    page?: string;
  }>;
}) {
  const p = await searchParams;
  const q = (p.q || "").slice(0, 160);
  const currentStatus = p.status || "";
  const isArchived = p.archived === "true";
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const { db, profile } = await session();
  const admin = profile.role === "admin";

  let query = db
    .from("projects")
    .select("*", { count: "exact" })
    .eq("archived", isArchived)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (q) {
    const escapedQ = q.replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name", "%" + escapedQ + "%");
  }
  if (["draft", "active", "on_hold", "completed"].includes(currentStatus))
    query = query.eq("status", currentStatus);
  const result = await query.range((page - 1) * 24, page * 24 - 1);
  check(result.error);
  const projects = result.data as Project[];
  const [ms, cs] = await Promise.all([
    projects.length
      ? db
          .from("milestones")
          .select("id,project_id,title,status,due_date,created_at")
          .in(
            "project_id",
            projects.map((proj) => proj.id),
          )
      : Promise.resolve({ data: [], error: null }),
    db.from("clients").select("id,name,company"),
  ]);
  check(ms.error);
  check(cs.error);
  const milestones = (ms.data ?? []) as Milestone[],
    clients = (cs.data ?? []) as Client[];

  const pageUrl = (n: number) =>
    "/projects?" +
    new URLSearchParams({
      q,
      status: p.status || "",
      archived: p.archived || "",
      page: String(n),
    }).toString();

  const filterUrl = (overrides: {
    q?: string;
    status?: string;
    archived?: string;
  }) => {
    const params = new URLSearchParams();
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    const nextStatus =
      overrides.status !== undefined ? overrides.status : currentStatus;
    const nextArchived =
      overrides.archived !== undefined ? overrides.archived : p.archived || "";
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    if (nextArchived === "true") params.set("archived", "true");
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  const totalCount = result.count ?? 0;
  const hasFilters = Boolean(q || currentStatus || isArchived);
  const inReviewMilestones = milestones.filter(
    (m) => m.status === "in_review",
  ).length;
  const approvedMilestones = milestones.filter(
    (m) => m.status === "approved",
  ).length;

  return (
    <div className="projects-workspace">
      <header className="command-header page-heading projects-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">A PLACE FOR EVERY PROJECT</p>
            <Badge value={isArchived ? "archived" : currentStatus || "active"} />
          </div>
          <h1>Projects</h1>
          <p className="muted">
            The scope, the details, the next step. All in one place.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Projects workspace summary"
          >
            <span className="command-summary-pill">
              <FolderKanban size={13} />
              <span>
                <strong>{totalCount}</strong> project
                {totalCount === 1 ? "" : "s"}{" "}
                {isArchived ? "archived" : "in workspace"}
              </span>
            </span>

            {milestones.length > 0 && (
              <span className="command-summary-pill is-clear">
                <CheckCheck size={13} />
                <span>
                  <strong>
                    {approvedMilestones}/{milestones.length}
                  </strong>{" "}
                  milestones approved
                </span>
              </span>
            )}

            {inReviewMilestones > 0 && (
              <Link
                href="/approvals"
                className="command-summary-pill is-attention"
              >
                <span>
                  <strong>{inReviewMilestones}</strong>{" "}
                  {inReviewMilestones === 1
                    ? "milestone in review"
                    : "milestones in review"}
                </span>
              </Link>
            )}
          </div>
        </div>

        {admin && (
          <div className="command-header-actions">
            <NewProjectLink />
          </div>
        )}
      </header>

      <section
        className="projects-discovery-panel glass-container"
        aria-label="Filter and search projects"
      >
        <div className="projects-filter-pills-row">
          <div
            className="projects-status-pills"
            role="navigation"
            aria-label="Quick status filters"
          >
            {statusFilters.map((item) => {
              const active = currentStatus === item.value;
              return (
                <Link
                  key={item.value || "all"}
                  href={filterUrl({ status: item.value })}
                  aria-current={active ? "page" : undefined}
                  className={`projects-filter-pill glass-button ${
                    active ? "is-active" : ""
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div
            className="projects-view-toggle"
            role="group"
            aria-label="Archive filter"
          >
            <Link
              href={filterUrl({ archived: "" })}
              aria-current={!isArchived ? "page" : undefined}
              className={`projects-view-pill ${!isArchived ? "is-active" : ""}`}
            >
              Current
            </Link>
            <Link
              href={filterUrl({ archived: "true" })}
              aria-current={isArchived ? "page" : undefined}
              className={`projects-view-pill ${isArchived ? "is-active" : ""}`}
            >
              Archived
            </Link>
          </div>
        </div>

        <form className="filter-bar projects-filter-bar" action="/projects">
          {currentStatus && (
            <input type="hidden" name="status" value={currentStatus} />
          )}
          {isArchived && <input type="hidden" name="archived" value="true" />}
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search projects</span>
            <input name="q" placeholder="Find a project…" defaultValue={q} />
          </label>
          <button className="button secondary glass-button" type="submit">
            <Search size={15} />
            Search
          </button>
          {hasFilters && (
            <Link
              href="/projects"
              className="button secondary glass-button projects-reset-btn"
            >
              <RotateCcw size={14} />
              Reset filters
            </Link>
          )}
        </form>
      </section>

      <div className="projects-results-bar">
        <p className="result-count">
          {totalCount} project{totalCount === 1 ? "" : "s"}
          {isArchived ? " · archived" : ""}
          {currentStatus
            ? ` · ${currentStatus.replace("_", " ")}`
            : ""}
          {q ? ` · Matching "${q}"` : ""}
        </p>
      </div>

      {projects.length ? (
        <div
          className={`project-grid command-project-grid ${
            projects.length === 1
              ? "is-single"
              : projects.length === 2
                ? "is-pair"
                : "is-multi"
          }`}
        >
          {projects.map((project) => {
            const clientRec = clients.find((c) => c.id === project.client_id);
            const clientLabel = clientRec
              ? clientRec.company
                ? `${clientRec.name} · ${clientRec.company}`
                : clientRec.name
              : undefined;
            return (
              <ProjectCard
                key={project.id}
                project={project}
                milestones={milestones.filter(
                  (m) => m.project_id === project.id,
                )}
                client={clientLabel}
                admin={admin}
                featured={projects.length === 1}
              />
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            q || p.status
              ? "No matching projects."
              : "A fresh page for your next project."
          }
          description={
            q || p.status
              ? "Try a different search or status filter."
              : profile.role === "admin"
                ? "Create a project to bring your client, files and feedback together."
                : "Projects assigned to your account will appear here."
          }
          href={
            q || p.status || isArchived
              ? "/projects"
              : profile.role === "admin"
                ? "/projects/new"
                : undefined
          }
          action={
            q || p.status || isArchived
              ? "Reset filters"
              : profile.role === "admin"
                ? "Create a project"
                : undefined
          }
        />
      )}

      <div className="pagination">
        {page > 1 && <Link href={pageUrl(page - 1)}>← Previous</Link>}
        {(result.count ?? 0) > page * 24 && (
          <Link href={pageUrl(page + 1)}>Next →</Link>
        )}
      </div>
    </div>
  );
}

