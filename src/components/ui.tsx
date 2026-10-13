import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  FolderOpen,
  Plus,
  ArrowLeft,
  CalendarDays,
} from "lucide-react";
import type { ReactNode } from "react";
import { label, dueLabel, progress, getProjectNextAction } from "@/lib/utils";
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
  admin = false,
  featured = false,
}: {
  project: Project;
  milestones: Milestone[];
  client?: string;
  admin?: boolean;
  featured?: boolean;
}) {
  const done = milestones.filter((m) => m.status === "approved").length;
  const inReviewCount = milestones.filter(
    (m) => m.status === "in_review",
  ).length;
  const plannedCount = milestones.filter((m) => m.status === "planned").length;
  const pct = progress(milestones);
  const nextAction = getProjectNextAction(project, milestones, admin);
  const currentMilestone =
    milestones.find((m) => m.status !== "approved") ||
    milestones[milestones.length - 1];

  return (
    <Link
      href={"/projects/" + project.id}
      className={`project-card command-project-card glass-container ${
        featured ? "is-featured-single" : ""
      }`}
    >
      <div className="command-project-main">
        <div className="card-top">
          <div className="command-project-brand">
            <span className="project-symbol glass-container glass-container-circle">
              <FolderOpen size={18} />
            </span>
            <div className="command-project-brand-meta">
              <p className="caption">{client || "YOUR PROJECT"}</p>
              {featured && (
                <span className="command-featured-tag">
                  Featured project workspace
                </span>
              )}
            </div>
          </div>
          <Badge value={project.archived ? "archived" : project.status} />
        </div>
        <h2>{project.name}</h2>
        <p className="scope-preview">
          {project.scope || "Scope has not been added yet."}
        </p>
        <footer className="command-project-footer">
          <span className="command-project-due">
            <CalendarDays size={13} />
            {dueLabel(project.deadline)}
          </span>
          <span className={`command-next-action tone-${nextAction.tone}`}>
            {nextAction.text}
            <ArrowUpRight size={15} />
          </span>
        </footer>
      </div>

      <div
        className={`command-project-progress ${
          milestones.length === 0 ? "is-unscheduled" : ""
        }`}
      >
        <div className="progress-label">
          <span>
            {milestones.length
              ? `${done} of ${milestones.length} milestones approved`
              : "No milestones yet"}
          </span>
          <strong>{pct}%</strong>
        </div>
        <div
          className={`progress-track ${
            milestones.length === 0 ? "is-empty" : ""
          }`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${project.name} milestone completion`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        {currentMilestone ? (
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
        ) : (
          <div className="command-milestone-chip is-empty-chip">
            <span className="command-milestone-chip-label">
              {admin
                ? "Add milestones to track delivery stages"
                : "Milestones will appear once scheduled"}
            </span>
            <span className="command-milestone-chip-status">Pending setup</span>
          </div>
        )}
        {featured && (
          <div className="command-single-project-metrics">
            <div>
              <span>Approved</span>
              <strong>{done}</strong>
            </div>
            <div>
              <span>In review</span>
              <strong>{inReviewCount}</strong>
            </div>
            <div>
              <span>Planned</span>
              <strong>{plannedCount}</strong>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

