import Link from "next/link";
import {
  CalendarDays,
  Users,
  ArrowDownToLine,
  Paperclip,
  MessageSquare,
  CheckCheck,
  Flag,
  FileText,
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
import { date, timestamp, bytes, progress } from "@/lib/utils";
import type { Client } from "@/lib/types";
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requested } = await searchParams;
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
      count: submissions.filter((s) => s.status === "pending").length,
    },
  ];
  return (
    <>
      <BackLink href="/projects">All projects</BackLink>
      <header className="project-heading">
        <div>
          <p className="eyebrow">{client.company || client.name}</p>
          <h1>{project.name}</h1>
          <div className="project-meta">
            <Badge value={project.archived ? "archived" : project.status} />
            <span>
              <CalendarDays size={15} />
              {date(project.deadline)}
            </span>
            <span>
              <Users size={15} />
              {client.name}
            </span>
          </div>
        </div>
        <div className="project-completion">
          <strong>
            {progress(milestones)}
            <span>%</span>
          </strong>
          <p>Milestones approved</p>
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
            {count !== null && <small>{count}</small>}
          </Link>
        ))}
      </nav>
      {readOnly && (
        <div className="notice">
          This project is {project.archived ? "archived" : "completed"} and
          read-only.{" "}
          {admin
            ? "Restore it or change its status to continue working."
            : "Aiquor can reopen it if more work is needed."}
        </div>
      )}
      {tab === "overview" && (
        <div className="overview-grid">
          <section className="panel">
            <p className="eyebrow">THE BIG PICTURE</p>
            <h2>Project scope</h2>
            <p className="preserve scope-content">
              {project.scope || "The project scope has not been added yet."}
            </p>
            <div className="scope-footer">
              <span>Created {date(project.created_at)}</span>
              <span>Updated {date(project.updated_at)}</span>
            </div>
            {admin && (
              <details className="edit-details">
                <summary>Edit project details</summary>
                <Form action={updateProject}>
                  <Hidden name="id" value={id} />
                  <ProjectFields project={project} clients={clients} />
                </Form>
              </details>
            )}
          </section>
          <aside>
            <section className="panel">
              <h2>The next step</h2>
              {milestones.find((m) => m.status !== "approved") ? (
                <>
                  <p>
                    {milestones.find((m) => m.status !== "approved")!.title}
                  </p>
                  <Link
                    href={"/projects/" + id + "?tab=milestones"}
                    className="text-link"
                  >
                    Open milestones →
                  </Link>
                </>
              ) : (
                <p className="muted">
                  {milestones.length
                    ? "Every milestone is approved."
                    : "No milestones yet. Define the steps that will move this project forward."}
                </p>
              )}
              <div className="progress-label">
                <span>
                  {milestones.filter((m) => m.status === "approved").length} of{" "}
                  {milestones.length} approved
                </span>
                <strong>{progress(milestones)}%</strong>
              </div>
              <div className="progress-track">
                <span style={{ width: progress(milestones) + "%" }} />
              </div>
            </section>
            {admin && (
              <section className="panel archive-panel">
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
          {admin && !readOnly && (
            <details className="panel create-panel">
              <summary>
                <Flag size={18} />
                Add a milestone<span>+</span>
              </summary>
              <Form action={addMilestone} submit="Add milestone" reset>
                <Hidden name="project_id" value={id} />
                <div className="form-grid">
                  <Field label="Milestone title" name="title" maxLength={160} />
                  <Field
                    label="Due date"
                    name="due_date"
                    type="date"
                    required={false}
                  />
                </div>
                <Textarea label="Deliverables" name="description" />
              </Form>
            </details>
          )}
          {milestones.length ? (
            <div className="milestone-list">
              {milestones.map((m, index) => (
                <article className="panel milestone-card" key={m.id}>
                  <div className="milestone-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="milestone-body">
                    <div className="card-top">
                      <h2>{m.title}</h2>
                      <Badge value={m.status} />
                    </div>
                    <p className="preserve">
                      {m.description || "No deliverables described yet."}
                    </p>
                    <p className="muted small">Due {date(m.due_date)}</p>
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
                        View review history →
                      </Link>
                    )}
                  </div>
                </article>
              ))}
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
          <section className="panel">
            {files.length ? (
              <div className="file-list">
                {files.map((file) => (
                  <article key={file.id} className="file-row">
                    <span className="file-icon">
                      <FileText size={22} />
                    </span>
                    <div className="file-description">
                      <strong>{file.original_name}</strong>
                      <small>
                        {bytes(file.size)} · {file.author_name} ·{" "}
                        {date(file.created_at)}
                      </small>
                    </div>
                    <a className="button secondary" href={"/files/" + file.id}>
                      <ArrowDownToLine size={16} />
                      Download
                    </a>
                    {!readOnly && (admin || file.uploaded_by === user.id) && (
                      <Form
                        action={deleteFile}
                        submit="Delete"
                        danger
                        confirm={`Permanently delete ${file.original_name}?`}
                      >
                        <Hidden name="id" value={file.id} />
                      </Form>
                    )}
                  </article>
                ))}
              </div>
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
            <section className="panel">
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
                <article className="panel comment" key={comment.id}>
                  <span className="avatar">
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
                      <details>
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
    </>
  );
}
