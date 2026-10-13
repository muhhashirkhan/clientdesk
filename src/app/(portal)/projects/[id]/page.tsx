import Link from "next/link";
import {
  CalendarDays,
  Users,
  ArrowDownToLine,
  ArrowUpRight,
  Paperclip,
  MessageSquare,
  CheckCheck,
  Flag,
  FileText,
  Clock3,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { projectData, check } from "@/lib/data";
import { BackLink, Badge, Empty } from "@/components/ui";
import { Form, Field, Textarea, Hidden, UploadForm } from "@/components/forms";
import { ProjectFields } from "@/components/project-fields";
import { ReviewCard } from "@/components/review-card";
import {
  updateProject,
  archiveProject,
  addMilestone,
  editMilestone,
  submitMilestone,
  postComment,
  deleteFile,
} from "@/app/actions";
import {
  date,
  dueLabel,
  timestamp,
  bytes,
  progress,
  getProjectNextAction,
} from "@/lib/utils";
import type { Client } from "@/lib/types";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { tab: requested, edit } = await searchParams;
  const editOpen = edit === "1" || edit === "true";
  const tab = [
    "overview",
    "milestones",
    "files",
    "discussion",
    "approvals",
  ].includes(requested || "")
    ? requested!
    : "overview";
  const {
    db,
    user,
    profile,
    project,
    milestones,
    submissions,
    decisions,
    files,
    comments,
    client,
  } = await projectData(id);
  const admin = profile.role === "admin",
    readOnly = project.archived || project.status === "completed";
  let clients: Client[] = [];
  if (admin) {
    const result = await db.from("clients").select("*").order("name");
    check(result.error);
    clients = result.data as Client[];
  }

  const pendingSubmissions = submissions.filter((s) => s.status === "pending");
  const approvedMilestones = milestones.filter((m) => m.status === "approved");
  const inReviewMilestones = milestones.filter((m) => m.status === "in_review");
  const changesMilestones = milestones.filter(
    (m) => m.status === "changes_requested",
  );
  const plannedMilestones = milestones.filter((m) => m.status === "planned");
  const pct = progress(milestones);
  const nextAction = getProjectNextAction(project, milestones, admin);
  const activeMilestone = milestones.find((m) => m.status !== "approved");
  const readyToComplete =
    !readOnly && milestones.length > 0 && !activeMilestone;
  const totalFileBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);

  const tabs = [
    { key: "overview", label: "Overview", icon: FileText, count: null },
    {
      key: "milestones",
      label: "Milestones",
      icon: Flag,
      count: milestones.length,
    },
    { key: "files", label: "Files", icon: Paperclip, count: files.length },
    {
      key: "discussion",
      label: "Discussion",
      icon: MessageSquare,
      count: comments.length,
    },
    {
      key: "approvals",
      label: "Approvals",
      icon: CheckCheck,
      count: pendingSubmissions.length,
    },
  ];

  const totalM = milestones.length || 1;
  const approvedPct = Math.round((approvedMilestones.length / totalM) * 100);
  const reviewPct = Math.round((inReviewMilestones.length / totalM) * 100);
  const changesPct = Math.round((changesMilestones.length / totalM) * 100);
  const plannedPct = Math.max(
    0,
    100 - approvedPct - reviewPct - changesPct,
  );

  return (
    <div className="project-detail-workspace">
      <div className="project-back-row">
        <BackLink href="/projects">All projects</BackLink>
        {admin && readyToComplete ? (
          <Link
            href={"/projects/" + id + "?tab=overview&edit=1#edit-project-details"}
            className={`project-next-pill is-interactive tone-${nextAction.tone}`}
          >
            <Sparkles size={13} />
            {nextAction.text}
            <ArrowUpRight size={13} />
          </Link>
        ) : (
          <span className={`project-next-pill tone-${nextAction.tone}`}>
            <Sparkles size={13} />
            {nextAction.text}
          </span>
        )}
      </div>

      <header className="project-heading project-command-header glass-container">
        <div className="project-heading-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">{client.company || client.name}</p>
            <Badge value={project.archived ? "archived" : project.status} />
          </div>
          <h1>{project.name}</h1>
          <div className="project-meta">
            <span>
              <CalendarDays size={15} />
              {dueLabel(project.deadline)}
            </span>
            <span>
              <Users size={15} />
              {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </span>
            <span>
              <Clock3 size={15} />
              Updated {date(project.updated_at)}
            </span>
          </div>
        </div>

        <div className="project-completion">
          <strong>
            {pct}
            <span>%</span>
          </strong>
          <p>
            {milestones.length
              ? `${approvedMilestones.length} of ${milestones.length} milestones approved`
              : "Milestones approved"}
          </p>
          <div
            className="command-segmented-bar project-header-bar"
            aria-hidden="true"
          >
            {milestones.length > 0 ? (
              <>
                {approvedMilestones.length > 0 && (
                  <span
                    className="seg-approved"
                    style={{ width: `${approvedPct}%` }}
                  />
                )}
                {inReviewMilestones.length > 0 && (
                  <span
                    className="seg-review"
                    style={{ width: `${reviewPct}%` }}
                  />
                )}
                {changesMilestones.length > 0 && (
                  <span
                    className="seg-changes"
                    style={{ width: `${changesPct}%` }}
                  />
                )}
                {plannedMilestones.length > 0 && (
                  <span
                    className="seg-planned"
                    style={{ width: `${plannedPct}%` }}
                  />
                )}
              </>
            ) : (
              <span className="seg-empty" style={{ width: "100%" }} />
            )}
          </div>
        </div>
      </header>

      <nav className="project-tabs" aria-label="Project sections">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <Link
            key={key}
            href={"/projects/" + id + "?tab=" + key}
            aria-current={tab === key ? "page" : undefined}
          >
            <Icon size={16} />
            {label}
            {count !== null && (
              <small
                className={
                  key === "approvals" && count > 0 ? "is-attention" : ""
                }
              >
                {count}
              </small>
            )}
          </Link>
        ))}
      </nav>

      {readOnly && (
        <div className="notice project-readonly-banner">
          <AlertTriangle size={17} />
          <span>
            This project is {project.archived ? "archived" : "completed"} and
            read-only.{" "}
            {admin
              ? "Restore it or change its status to continue working."
              : "Aiquor can reopen it if more work is needed."}
          </span>
        </div>
      )}

      {tab === "overview" && (
        <div className="overview-grid">
          <div className="overview-primary">
            <section className="panel project-scope-panel glass-container">
              <div className="card-top project-section-top">
                <div>
                  <p className="eyebrow">THE BIG PICTURE</p>
                  <h2>Project scope</h2>
                </div>
                <Badge value={project.archived ? "archived" : project.status} />
              </div>
              <p className="preserve scope-content">
                {project.scope || "The project scope has not been added yet."}
              </p>
              <div className="scope-footer">
                <span>Created {date(project.created_at)}</span>
                <span>Updated {date(project.updated_at)}</span>
              </div>
              {admin && !project.archived && (
                <details
                  id="edit-project-details"
                  className="edit-details"
                  open={editOpen || undefined}
                >
                  <summary>Edit project details</summary>
                  <Form action={updateProject}>
                    <Hidden name="id" value={id} />
                    <ProjectFields project={project} clients={clients} />
                  </Form>
                </details>
              )}
            </section>

            <section className="panel project-roadmap-panel glass-container">
              <div className="card-top project-section-top">
                <div>
                  <p className="eyebrow">DELIVERY ROADMAP</p>
                  <h2>Milestone progress</h2>
                </div>
                <Link
                  href={"/projects/" + id + "?tab=milestones"}
                  className="text-link"
                >
                  Open milestones <ArrowUpRight size={14} />
                </Link>
              </div>

              {milestones.length ? (
                <div className="overview-milestone-list">
                  {milestones.slice(0, 4).map((m, idx) => (
                    <Link
                      key={m.id}
                      href={"/projects/" + id + "?tab=milestones"}
                      className="overview-milestone-row"
                    >
                      <span
                        className={`overview-milestone-num status-${m.status}`}
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="overview-milestone-info">
                        <strong>{m.title}</strong>
                        <small>{dueLabel(m.due_date)}</small>
                      </div>
                      <Badge value={m.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="muted overview-empty-copy">
                  {admin
                    ? "No milestones added yet. Break the agreed scope into clear milestones so the client can track progress and approve deliverables."
                    : "Milestones will appear here once Aiquor schedules the project phases."}
                </p>
              )}

              <div className="project-overview-metrics">
                <div>
                  <span>Milestones</span>
                  <strong>
                    {approvedMilestones.length}/{milestones.length} approved
                  </strong>
                </div>
                <div>
                  <span>Shared files</span>
                  <strong>{files.length} uploaded</strong>
                </div>
                <div>
                  <span>Discussion</span>
                  <strong>{comments.length} messages</strong>
                </div>
                <div>
                  <span>Approvals</span>
                  <strong>{submissions.length} submissions</strong>
                </div>
              </div>
            </section>
          </div>

          <aside>
            <section className="panel project-next-panel glass-container">
              <p className="eyebrow">CURRENT FOCUS</p>
              <h2>The next step</h2>
              {activeMilestone ? (
                <div className="next-step-focus-box">
                  <div className="next-step-focus-header">
                    <strong>{activeMilestone.title}</strong>
                    <Badge value={activeMilestone.status} />
                  </div>
                  <p className="muted small">
                    {dueLabel(activeMilestone.due_date)}
                  </p>
                  <Link
                    href={
                      activeMilestone.status === "in_review"
                        ? "/projects/" + id + "?tab=approvals"
                        : "/projects/" + id + "?tab=milestones"
                    }
                    className="text-link"
                  >
                    {activeMilestone.status === "in_review"
                      ? "Open approvals →"
                      : "Open milestones →"}
                  </Link>
                </div>
              ) : milestones.length > 0 ? (
                <div className="next-step-focus-box is-complete-ready">
                  <div className="next-step-focus-header">
                    <strong>
                      {project.status === "completed"
                        ? "Project completed"
                        : "All milestones approved"}
                    </strong>
                    <Badge
                      value={
                        project.archived
                          ? "archived"
                          : project.status === "completed"
                            ? "completed"
                            : "approved"
                      }
                    />
                  </div>
                  <p className="muted small">
                    {project.archived
                      ? "Every milestone is approved and this project is archived."
                      : project.status === "completed"
                        ? "Every milestone is approved and this project is marked completed."
                        : "Every milestone is approved. This project is ready for final completion."}
                  </p>
                  {admin && !readOnly && (
                    <Link
                      href={
                        "/projects/" +
                        id +
                        "?tab=overview&edit=1#edit-project-details"
                      }
                      className="text-link"
                    >
                      Mark project completed in details →
                    </Link>
                  )}
                </div>
              ) : (
                <p className="muted">
                  No milestones yet. Define the steps that will move this
                  project forward.
                </p>
              )}
              <div className="progress-label">
                <span>
                  {approvedMilestones.length} of {milestones.length} approved
                </span>
                <strong>{pct}%</strong>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${project.name} milestone completion`}
              >
                <span style={{ width: pct + "%" }} />
              </div>

              <div className="overview-status-grid">
                <div>
                  <span>Approved</span>
                  <strong>{approvedMilestones.length}</strong>
                </div>
                <div>
                  <span>In review</span>
                  <strong>{inReviewMilestones.length}</strong>
                </div>
                <div>
                  <span>Revisions</span>
                  <strong>{changesMilestones.length}</strong>
                </div>
                <div>
                  <span>Planned</span>
                  <strong>{plannedMilestones.length}</strong>
                </div>
              </div>
            </section>

            <section className="panel project-files-preview glass-container">
              <div className="card-top project-section-top">
                <div>
                  <p className="eyebrow">SHARED ASSETS</p>
                  <h3>Recent files</h3>
                </div>
                <Link
                  href={"/projects/" + id + "?tab=files"}
                  className="text-link"
                >
                  All files ({files.length}) <ArrowUpRight size={14} />
                </Link>
              </div>
              {files.length ? (
                <div className="overview-files-mini">
                  {files.slice(0, 3).map((f) => (
                    <a
                      key={f.id}
                      href={"/files/" + f.id}
                      className="overview-file-chip"
                    >
                      <FileText size={15} />
                      <div className="overview-file-chip-text">
                        <strong>{f.original_name}</strong>
                        <small>{bytes(f.size)}</small>
                      </div>
                      <ArrowDownToLine size={14} />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No project files uploaded yet. Share briefs, assets or
                  deliverables in the Files tab.
                </p>
              )}
            </section>

            {admin && (
              <section className="panel archive-panel glass-container">
                <h3>
                  {project.archived
                    ? "Restore this project"
                    : "Archive this project"}
                </h3>
                <p>
                  Archiving keeps its files, decisions and conversations
                  available as a read-only record.
                </p>
                <Form
                  action={archiveProject}
                  submit={
                    project.archived ? "Restore project" : "Archive project"
                  }
                  confirm={
                    project.archived
                      ? undefined
                      : "Archive this project and make it read-only?"
                  }
                >
                  <Hidden name="id" value={id} />
                  <Hidden name="archived" value={String(!project.archived)} />
                </Form>
              </section>
            )}
          </aside>
        </div>
      )}

      {tab === "milestones" && (
        <>
          <div className="milestone-summary-strip glass-container">
            <div className="milestone-summary-cell">
              <span>Total milestones</span>
              <strong>{milestones.length}</strong>
            </div>
            <div className="milestone-summary-cell">
              <span>Approved</span>
              <strong className="text-emerald">
                {approvedMilestones.length}
              </strong>
            </div>
            <div className="milestone-summary-cell">
              <span>In review</span>
              <strong className="text-warning">
                {inReviewMilestones.length}
              </strong>
            </div>
            <div className="milestone-summary-cell">
              <span>Changes requested</span>
              <strong className="text-danger">
                {changesMilestones.length}
              </strong>
            </div>
          </div>

          {admin && !readOnly && (
            <details className="panel create-panel glass-container">
              <summary>
                <Flag size={18} />
                Add a milestone<span>+</span>
              </summary>
              <Form action={addMilestone} submit="Add milestone" reset>
                <Hidden name="project_id" value={id} />
                <div className="form-grid">
                  <Field
                    label="Milestone title"
                    name="title"
                    maxLength={160}
                    placeholder="e.g. Phase 1 — Architecture & Design System"
                  />
                  <Field
                    label="Due date"
                    name="due_date"
                    type="date"
                    required={false}
                  />
                </div>
                <Textarea
                  label="Deliverables"
                  name="description"
                  placeholder="Describe the concrete outputs, review criteria, and deliverables included in this milestone."
                />
              </Form>
            </details>
          )}

          {milestones.length ? (
            <div className="milestone-list">
              {milestones.map((m, index) => {
                const latestSub = submissions.find(
                  (s) => s.milestone_id === m.id,
                );
                const latestDec = latestSub
                  ? decisions.find((d) => d.submission_id === latestSub.id)
                  : undefined;

                return (
                  <article
                    className={`panel milestone-card glass-container status-${m.status}`}
                    key={m.id}
                  >
                    <div className={`milestone-number status-${m.status}`}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="milestone-body">
                      <div className="card-top">
                        <div>
                          <span className="milestone-seq-label">
                            MILESTONE {String(index + 1).padStart(2, "0")} ·{" "}
                            {dueLabel(m.due_date)}
                          </span>
                          <h2>{m.title}</h2>
                        </div>
                        <Badge value={m.status} />
                      </div>
                      <p className="preserve">
                        {m.description || "No deliverables described yet."}
                      </p>

                      {latestSub && (
                        <div className="milestone-submission-strip">
                          <div className="milestone-submission-meta">
                            <strong>Latest submission</strong>
                            <span>
                              by {latestSub.author_name} ·{" "}
                              {timestamp(latestSub.created_at)}
                            </span>
                          </div>
                          <p className="preserve">{latestSub.notes}</p>
                          {latestDec && (
                            <p className="milestone-decision-note">
                              <strong>
                                {latestDec.actor_name}{" "}
                                {latestDec.decision === "approved"
                                  ? "approved"
                                  : "requested changes"}
                              </strong>
                              {latestDec.feedback
                                ? `: "${latestDec.feedback}"`
                                : ""}
                            </p>
                          )}
                        </div>
                      )}

                      {admin && !readOnly && (
                        <details className="edit-details">
                          <summary>Edit milestone</summary>
                          <Form action={editMilestone}>
                            <Hidden name="id" value={m.id} />
                            <Field
                              label="Title"
                              name="title"
                              value={m.title}
                              maxLength={160}
                            />
                            <Textarea
                              label="Deliverables"
                              name="description"
                              value={m.description}
                            />
                            <Field
                              label="Due date"
                              name="due_date"
                              type="date"
                              value={m.due_date || ""}
                              required={false}
                            />
                          </Form>
                        </details>
                      )}
                      {admin &&
                        !readOnly &&
                        ["planned", "changes_requested"].includes(m.status) && (
                          <details className="submit-work">
                            <summary>
                              {m.status === "changes_requested"
                                ? "Submit revised work"
                                : "Submit work for review"}
                            </summary>
                            <Form
                              action={submitMilestone}
                              submit="Submit for client review"
                            >
                              <Hidden name="milestone" value={m.id} />
                              <Textarea
                                label="What is ready for review?"
                                name="notes"
                                required
                                placeholder="Describe the deliverable and any files the client should open."
                              />
                              <Field
                                label="Preview link"
                                name="preview_url"
                                type="url"
                                required={false}
                                placeholder="https://…"
                              />
                              <p className="muted small">
                                Upload screenshots and deliverables in the Files
                                tab before submitting.
                              </p>
                            </Form>
                          </details>
                        )}
                      {["in_review", "changes_requested", "approved"].includes(
                        m.status,
                      ) && (
                        <Link
                          className="text-link"
                          href={"/projects/" + id + "?tab=approvals"}
                        >
                          {!admin && m.status === "in_review"
                            ? "Review & approve deliverable →"
                            : "View review history →"}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Give this project a clear path."
              description={
                admin
                  ? "Add the steps and deliverables you’ve agreed with your client."
                  : "Aiquor will add the milestones for your project here."
              }
            />
          )}
        </>
      )}

      {tab === "files" && (
        <>
          {!readOnly && <UploadForm projectId={id} userId={user.id} />}
          <section className="panel files-panel glass-container">
            {files.length ? (
              <>
                <div className="files-panel-header">
                  <div>
                    <p className="eyebrow">PROTECTED PROJECT REPOSITORY</p>
                    <h2>
                      Shared files & deliverables ({files.length})
                    </h2>
                  </div>
                  <span className="files-storage-pill">
                    Total size: {bytes(totalFileBytes)}
                  </span>
                </div>
                <div className="file-list">
                  {files.map((file) => (
                    <article key={file.id} className="file-row">
                      <span className="file-icon glass-container glass-container-circle">
                        <FileText size={20} />
                      </span>
                      <div className="file-description">
                        <strong>{file.original_name}</strong>
                        <small>
                          {bytes(file.size)} · {file.author_name} ·{" "}
                          {date(file.created_at)}
                        </small>
                      </div>
                      <div className="file-row-actions">
                        <a
                          className="button secondary glass-button"
                          href={"/files/" + file.id}
                        >
                          <ArrowDownToLine size={16} />
                          Download
                        </a>
                        {!readOnly &&
                          (admin || file.uploaded_by === user.id) && (
                            <Form
                              action={deleteFile}
                              submit="Delete"
                              danger
                              confirm={`Permanently delete ${file.original_name}?`}
                            >
                              <Hidden name="id" value={file.id} />
                            </Form>
                          )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <Empty
                title="A home for every project file."
                description="Upload logos, content, requirements and deliverables. Only this project’s team and assigned client can access them."
              />
            )}
          </section>
        </>
      )}

      {tab === "discussion" && (
        <div className="discussion-layout">
          {!readOnly && (
            <section className="panel discussion-compose-panel glass-container">
              <p className="eyebrow">PROJECT CONVERSATION</p>
              <h2>Keep the conversation moving.</h2>
              <Form action={postComment} submit="Post comment" reset>
                <Hidden name="project_id" value={id} />
                <Hidden name="parent_id" value="" />
                <Textarea
                  label="Your message"
                  name="body"
                  required
                  placeholder="Share an update, ask a question, or add some context…"
                />
              </Form>
            </section>
          )}
          {comments.length ? (
            <div className="comments-list">
              {comments.map((comment) => (
                <article
                  className="panel comment glass-container"
                  key={comment.id}
                >
                  <span className="avatar glass-container glass-container-circle">
                    {comment.author_name[0]?.toUpperCase() || "C"}
                  </span>
                  <div>
                    <div className="comment-author">
                      <strong>{comment.author_name}</strong>
                      <time dateTime={comment.created_at}>
                        {timestamp(comment.created_at)}
                      </time>
                    </div>
                    {comment.parent_id && (
                      <blockquote>
                        Replying to{" "}
                        {comments.find((c) => c.id === comment.parent_id)
                          ?.author_name || "a previous comment"}
                        :{" "}
                        {comments
                          .find((c) => c.id === comment.parent_id)
                          ?.body.slice(0, 160)}
                      </blockquote>
                    )}
                    <p className="preserve">{comment.body}</p>
                    {!readOnly && (
                      <details className="comment-reply-details">
                        <summary>Reply</summary>
                        <Form action={postComment} submit="Post reply" reset>
                          <Hidden name="project_id" value={id} />
                          <Hidden name="parent_id" value={comment.id} />
                          <Textarea label="Your reply" name="body" required />
                        </Form>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Start the conversation."
              description="Messages and replies stay with the project, so useful context never gets lost."
            />
          )}
        </div>
      )}

      {tab === "approvals" &&
        (submissions.length ? (
          <div className="review-list">
            {submissions.map((s) => (
              <ReviewCard
                key={s.id}
                submission={s}
                decision={decisions.find((d) => d.submission_id === s.id)}
                title={
                  milestones.find((m) => m.id === s.milestone_id)?.title ||
                  "Milestone"
                }
                admin={admin}
                readOnly={readOnly}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="No work submitted yet."
            description="When a milestone is ready, its submission and decisions will appear here."
          />
        ))}
    </div>
  );
}

