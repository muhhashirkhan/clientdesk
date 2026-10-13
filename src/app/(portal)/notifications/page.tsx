import Link from "next/link";
import {
  Bell,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  MessageSquare,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { session, check } from "@/lib/data";
import { Empty, Badge } from "@/components/ui";
import { Form, Hidden } from "@/components/forms";
import { markRead, markAllRead } from "@/app/actions";
import { timestamp, label, parsePage, pageHref } from "@/lib/utils";
import type { Notice, Project } from "@/lib/types";

const NOTIFICATIONS_PAGE_SIZE = 25;

const kindFilters: { value: string; label: string }[] = [
  { value: "", label: "All activity" },
  { value: "review", label: "Reviews" },
  { value: "decision", label: "Decisions" },
  { value: "comment", label: "Comments" },
  { value: "project", label: "Project updates" },
  { value: "invitation", label: "Invitations" },
];

export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; kind?: string; page?: string }>;
}) {
  const { filter: rawFilter, kind: rawKind, page: rawPage } =
    await searchParams;
  const unreadOnly = rawFilter === "unread";
  const currentKind = [
    "review",
    "decision",
    "comment",
    "project",
    "invitation",
  ].includes(rawKind || "")
    ? rawKind!
    : "";

  const { db } = await session();

  let countQuery = db
    .from("notifications")
    .select("id", { count: "exact", head: true });
  if (unreadOnly) countQuery = countQuery.is("read_at", null);
  if (currentKind) countQuery = countQuery.eq("kind", currentKind);

  const [filteredExact, unreadExact, totalExact] = await Promise.all([
    countQuery,
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    db.from("notifications").select("id", { count: "exact", head: true }),
  ]);

  check(filteredExact.error);
  check(unreadExact.error);
  check(totalExact.error);

  const filteredTotalCount = filteredExact.count ?? 0;
  const unreadCount = unreadExact.count ?? 0;
  const totalCount = totalExact.count ?? 0;
  const readCount = Math.max(0, totalCount - unreadCount);

  const pagination = parsePage(
    rawPage,
    filteredTotalCount,
    NOTIFICATIONS_PAGE_SIZE,
  );

  let listQuery = db
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (unreadOnly) listQuery = listQuery.is("read_at", null);
  if (currentKind) listQuery = listQuery.eq("kind", currentKind);

  const listResult = await listQuery.range(pagination.from, pagination.to);
  check(listResult.error);

  const notices = (listResult.data ?? []) as Notice[];
  const projectIds = [
    ...new Set(notices.map((n) => n.project_id).filter((id): id is string => Boolean(id))),
  ];
  const projectsResult = projectIds.length
    ? await db.from("projects").select("id,name").in("id", projectIds)
    : { data: [], error: null };
  check(projectsResult.error);

  const projects = (projectsResult.data ?? []) as Pick<
    Project,
    "id" | "name"
  >[];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const buildFilterUrl = (overrides: { filter?: string; kind?: string }) => {
    const params = new URLSearchParams();
    const nextFilter =
      overrides.filter !== undefined
        ? overrides.filter
        : unreadOnly
          ? "unread"
          : "";
    const nextKind =
      overrides.kind !== undefined ? overrides.kind : currentKind;
    if (nextFilter === "unread") params.set("filter", "unread");
    if (nextKind) params.set("kind", nextKind);
    const qs = params.toString();
    return qs ? `/notifications?${qs}` : "/notifications";
  };

  return (
    <div className="notifications-workspace">
      <header className="command-header page-heading notifications-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">STAY IN THE LOOP</p>
            <Badge value={unreadCount > 0 ? "in_review" : "approved"} />
          </div>
          <h1>Notifications</h1>
          <p className="muted">
            New conversations, milestone review requests and recorded decisions
            in one chronological stream.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Notification center summary"
          >
            <span
              className={`command-summary-pill ${
                unreadCount > 0 ? "is-attention" : "is-clear"
              }`}
            >
              <Bell size={13} aria-hidden="true" />
              <span>
                <strong>{unreadCount}</strong> unread
              </span>
            </span>

            <span className="command-summary-pill">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>
                <strong>{readCount}</strong> read
              </span>
            </span>

            <span className="command-summary-pill">
              <Activity size={13} aria-hidden="true" />
              <span>
                <strong>{totalCount}</strong> total event
                {totalCount === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        </div>

        {unreadCount > 0 && (
          <div className="command-header-actions">
            <Form
              action={markAllRead}
              submit="Mark all as read"
              className="mark-all-form"
            />
          </div>
        )}
      </header>

      {totalCount > 0 && (
        <section
          className="projects-discovery-panel notifications-filter-panel glass-container"
          aria-label="Filter notifications"
        >
          <div className="projects-filter-pills-row is-single-row">
            <div
              className="projects-status-pills"
              role="navigation"
              aria-label="Notification type filters"
            >
              {kindFilters.map((item) => {
                const active = currentKind === item.value;
                return (
                  <Link
                    key={item.value || "all"}
                    href={buildFilterUrl({ kind: item.value })}
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
              aria-label="Read status filter"
            >
              <Link
                href={buildFilterUrl({ filter: "" })}
                aria-current={!unreadOnly ? "page" : undefined}
                className={`projects-view-pill ${
                  !unreadOnly ? "is-active" : ""
                }`}
              >
                All ({totalCount})
              </Link>
              <Link
                href={buildFilterUrl({ filter: "unread" })}
                aria-current={unreadOnly ? "page" : undefined}
                className={`projects-view-pill ${
                  unreadOnly ? "is-active" : ""
                }`}
              >
                Unread ({unreadCount})
              </Link>
            </div>
          </div>
        </section>
      )}

      {notices.length ? (
        <section
          className="panel command-activity-panel notifications-timeline-panel glass-container"
          aria-label="Activity and notifications timeline"
        >
          <div className="section-heading compact command-panel-header">
            <div>
              <p className="eyebrow">ACTIVITY STREAM</p>
              <div className="command-heading-title-row">
                <h2>
                  <Activity size={18} aria-hidden="true" />
                  {unreadOnly ? "Unread notifications" : "Workspace timeline"}
                </h2>
                {unreadCount > 0 && (
                  <span className="command-activity-unread-pill">
                    {unreadCount} unread
                  </span>
                )}
              </div>
            </div>
            <span className="notifications-showing-meta">
              Showing {notices.length} of { unreadOnly ? unreadCount : totalCount }
            </span>
          </div>

          <div
            className="command-activity-timeline notifications-list"
            role="list"
          >
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
                <article
                  key={n.id}
                  role="listitem"
                  className={`notification-row command-activity-item ${
                    unread ? "unread is-unread" : "is-read"
                  }`}
                >
                  <span
                    className={`notification-icon command-activity-node kind-${n.kind}`}
                    aria-hidden="true"
                  >
                    <KindIcon size={14} />
                  </span>

                  <div className="command-activity-body notification-body">
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
                        <span
                          className={`notification-status-tag ${
                            unread ? "is-unread" : "is-read"
                          }`}
                        >
                          {unread ? "Unread" : "Read"}
                        </span>
                      </div>
                      <time
                        className="command-activity-time"
                        dateTime={n.created_at}
                      >
                        {timestamp(n.created_at)}
                      </time>
                    </div>

                    <Link
                      href={
                        n.project_id
                          ? "/projects/" + n.project_id
                          : n.kind === "invitation"
                            ? "/settings"
                            : "/projects"
                      }
                      className="notification-message-link"
                    >
                      <span className="command-activity-message">
                        {n.message}
                      </span>
                      <ArrowUpRight
                        size={14}
                        className="command-activity-arrow"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>

                  {unread && (
                    <Form
                      action={markRead}
                      submit="Mark as read"
                      className="small-form notification-mark-form"
                    >
                      <Hidden name="id" value={n.id} />
                    </Form>
                  )}
                </article>
              );
            })}
          </div>

          <p className="muted small notifications-footer-note">
            Showing {pagination.from + 1}–{pagination.from + notices.length} of{" "}
            {filteredTotalCount} notification
            {filteredTotalCount === 1 ? "" : "s"}.
          </p>
        </section>
      ) : totalCount > 0 ? (
        <Empty
          title={
            unreadOnly
              ? "No unread notifications."
              : "No matching notifications."
          }
          description="You’re all caught up on this view. Switch back to all activity to browse your previous updates."
          href="/notifications"
          action="View all activity"
        />
      ) : (
        <Empty
          title="You’re all caught up."
          description="Comments, submitted work and client decisions will create real notifications here."
          href="/projects"
          action="Open projects"
        />
      )}

      {(pagination.hasPrev || pagination.hasNext) && (
        <nav className="pagination" aria-label="Notifications pagination">
          {pagination.hasPrev && (
            <Link
              href={pageHref(
                "/notifications",
                {
                  filter: unreadOnly ? "unread" : undefined,
                  kind: currentKind || undefined,
                },
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
                "/notifications",
                {
                  filter: unreadOnly ? "unread" : undefined,
                  kind: currentKind || undefined,
                },
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

