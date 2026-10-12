import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, FolderOpen, Plus, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { label, date, progress } from "@/lib/utils";
import type { Project, Milestone } from "@/lib/types";
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Image src="/brand/aiquor-symbol.svg" alt="" width={38} height={38} />
      </span>
      <span>
        ClientDesk<small>BY AIQUOR</small>
      </span>
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Empty({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty glass-container">
      <span className="empty-icon glass-container glass-container-circle">
        <FolderOpen size={26} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="button primary glass-button" href={href}>
          {action}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge glass-container glass-container-pill ${value}`}>
      <i />
      {label(value)}
    </span>
  );
}
export function NewProjectLink() {
  return (
    <Link href="/projects/new" className="button primary glass-button">
      <Plus size={17} />
      New project
    </Link>
  );
}
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="back-link glass-button" href={href}>
      <ArrowLeft size={15} />
      {children}
    </Link>
  );
}
export function ProjectCard({
  project,
  milestones,
  client,
}: {
  project: Project;
  milestones: Milestone[];
  client?: string;
}) {
  const done = milestones.filter((m) => m.status === "approved").length;
  return (
    <Link href={"/projects/" + project.id} className="project-card glass-container">
      <div className="card-top">
        <span className="project-symbol glass-container glass-container-circle">
          <FolderOpen size={20} />
        </span>
        <Badge value={project.archived ? "archived" : project.status} />
      </div>
      <p className="caption">{client || "YOUR PROJECT"}</p>
      <h2>{project.name}</h2>
      <p className="scope-preview">
        {project.scope || "Scope has not been added yet."}
      </p>
      <div className="progress-label">
        <span>
          {milestones.length
            ? `${done} of ${milestones.length} milestones approved`
            : "No milestones yet"}
        </span>
        <strong>{progress(milestones)}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress(milestones)}%` }} />
      </div>
      <footer>
        <span>Due {date(project.deadline)}</span>
        <ArrowUpRight size={19} />
      </footer>
    </Link>
  );
}
