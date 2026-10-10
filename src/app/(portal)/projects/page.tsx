import Link from "next/link";
import { Search } from "lucide-react";
import { session, check } from "@/lib/data";
import {
  PageHeader,
  Empty,
  ProjectCard,
  NewProjectLink,
} from "@/components/ui";
import type { Project, Milestone, Client } from "@/lib/types";
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
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const { db, profile } = await session();
  let query = db
    .from("projects")
    .select("*", { count: "exact" })
    .eq("archived", p.archived === "true")
    .order("updated_at", { ascending: false });
  if (q) query = query.ilike("name", "%" + q + "%");
  if (["draft", "active", "on_hold", "completed"].includes(p.status || ""))
    query = query.eq("status", p.status!);
  const result = await query.range((page - 1) * 24, page * 24 - 1);
  check(result.error);
  const projects = result.data as Project[];
  const [ms, cs] = await Promise.all([
    db
      .from("milestones")
      .select("*")
      .in(
        "project_id",
        projects.map((p) => p.id),
      ),
    db.from("clients").select("*"),
  ]);
  check(ms.error);
  check(cs.error);
  const milestones = ms.data as Milestone[],
    clients = cs.data as Client[];
  const pageUrl = (n: number) =>
    "/projects?" +
    new URLSearchParams({
      q,
      status: p.status || "",
      archived: p.archived || "",
      page: String(n),
    }).toString();
  return (
    <>
      <PageHeader
        eyebrow="A PLACE FOR EVERY PROJECT"
        title="Projects"
        description="The scope, the details, the next step. All in one place."
        action={profile.role === "admin" ? <NewProjectLink /> : undefined}
      />
      <form className="filter-bar" action="/projects">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">Search projects</span>
          <input name="q" placeholder="Find a project…" defaultValue={q} />
        </label>
        <label>
          <span className="sr-only">Project status</span>
          <select name="status" defaultValue={p.status || ""}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Archive filter</span>
          <select name="archived" defaultValue={p.archived || "false"}>
            <option value="false">Current projects</option>
            <option value="true">Archived projects</option>
          </select>
        </label>
        <button className="button secondary">Apply filters</button>
      </form>
      <p className="result-count">
        {result.count ?? 0} project{result.count === 1 ? "" : "s"}
      </p>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              milestones={milestones.filter((m) => m.project_id === project.id)}
              client={clients.find((c) => c.id === project.client_id)?.name}
            />
          ))}
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
        />
      )}
      <div className="pagination">
        {page > 1 && <Link href={pageUrl(page - 1)}>← Previous</Link>}
        {(result.count ?? 0) > page * 24 && (
          <Link href={pageUrl(page + 1)}>Next →</Link>
        )}
      </div>
    </>
  );
}
