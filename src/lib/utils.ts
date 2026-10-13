export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value))
    : "No deadline";
}
export function dueLabel(value: string | null | undefined) {
  return value ? `Due ${date(value)}` : "No deadline set";
}
export function timestamp(value: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export function bytes(value: number) {
  return value < 1048576
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / 1048576).toFixed(1)} MB`;
}
export function safeNext(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\x00-\x20\x7f]/.test(value)
    ? value
    : "/dashboard";
}
export function progress(milestones: { status: string }[]) {
  return milestones.length
    ? Math.round(
        (milestones.filter((m) => m.status === "approved").length /
          milestones.length) *
          100,
      )
    : 0;
}

export function getProjectNextAction(
  project: { status: string; archived?: boolean },
  projectMilestones: { title: string; status: string }[],
  admin = false,
): { text: string; tone: "emerald" | "warning" | "danger" | "muted" } {
  if (project.archived) {
    return { text: "Archived · Read-only", tone: "muted" };
  }
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

export function parsePage(
  raw: string | undefined,
  totalCount: number,
  pageSize = 24,
) {
  const safeTotal = Math.max(0, Math.floor(totalCount));
  const safeSize = Math.max(1, Math.floor(pageSize));
  const parsed = Number(raw);
  const requested = Number.isFinite(parsed)
    ? Math.max(1, Math.min(10000, Math.floor(parsed)))
    : 1;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const page = Math.min(requested, totalPages);
  const from = (page - 1) * safeSize;
  const to = from + safeSize - 1;
  return {
    page,
    pageSize: safeSize,
    totalPages,
    totalCount: safeTotal,
    from,
    to,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  targetPage: number,
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) search.set(k, v);
  }
  const safeTarget = Math.max(1, Math.floor(targetPage));
  if (safeTarget > 1) {
    search.set("page", String(safeTarget));
  } else {
    search.delete("page");
  }
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function selectLatestInvitations<
  T extends { id: string; client_id: string; created_at: string },
>(invitations: T[]): Map<string, T> {
  const sorted = [...invitations].sort((a, b) => {
    const timeDiff =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });
  const map = new Map<string, T>();
  for (const invite of sorted) {
    if (!map.has(invite.client_id)) {
      map.set(invite.client_id, invite);
    }
  }
  return map;
}


