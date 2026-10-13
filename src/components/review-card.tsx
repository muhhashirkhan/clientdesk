import Link from "next/link";
import {
  ArrowUpRight,
  CheckCheck,
  AlertTriangle,
  Clock3,
  UserCheck,
} from "lucide-react";
import { Form, Hidden, Textarea } from "./forms";
import { Badge } from "./ui";
import { decideSubmission } from "@/app/actions";
import { timestamp } from "@/lib/utils";
import type { Submission, Decision } from "@/lib/types";

export function ReviewCard({
  submission,
  decision,
  title,
  projectName,
  admin,
  readOnly = false,
}: {
  submission: Submission;
  decision?: Decision;
  title: string;
  projectName?: string;
  admin: boolean;
  readOnly?: boolean;
}) {
  const isChangesRequested = decision?.decision === "changes_requested";

  return (
    <article
      className={`panel review-card glass-container status-${submission.status}`}
    >
      <div className="card-top">
        <div>
          {projectName ? (
            <Link
              href={"/projects/" + submission.project_id}
              className="eyebrow review-project-link"
            >
              {projectName} <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          ) : (
            <p className="eyebrow">MILESTONE REVIEW</p>
          )}
          <h2>{title}</h2>
        </div>
        <Badge value={submission.status} />
      </div>

      <div className="review-notes-box">
        <span className="review-notes-label">DELIVERABLE NOTES</span>
        <p className="preserve">{submission.notes}</p>
      </div>

      <div className="review-links-row">
        {submission.preview_url && (
          <a
            className="button secondary glass-button"
            href={submission.preview_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open preview <ArrowUpRight size={16} />
          </a>
        )}
        <Link
          className="text-link"
          href={"/projects/" + submission.project_id + "?tab=files"}
        >
          View project files <ArrowUpRight size={14} />
        </Link>
        {projectName && (
          <Link
            className="text-link"
            href={"/projects/" + submission.project_id + "?tab=milestones"}
          >
            View milestone <ArrowUpRight size={14} />
          </Link>
        )}
      </div>

      <div className="review-meta">
        <span>
          <UserCheck size={13} /> Submitted by {submission.author_name}
        </span>
        <time dateTime={submission.created_at}>
          <Clock3 size={13} /> {timestamp(submission.created_at)}
        </time>
      </div>

      {decision ? (
        <div
          className={`decision-record ${
            isChangesRequested ? "is-changes-requested" : "is-approved"
          }`}
        >
          {isChangesRequested ? (
            <AlertTriangle size={19} />
          ) : (
            <CheckCheck size={19} />
          )}
          <div>
            <strong>
              {decision.actor_name}{" "}
              {decision.decision === "approved"
                ? "approved this work"
                : "requested changes"}
            </strong>
            <small>{timestamp(decision.created_at)}</small>
            {decision.feedback && (
              <p className="preserve">{decision.feedback}</p>
            )}
          </div>
        </div>
      ) : (
        submission.status === "pending" &&
        (!admin && !readOnly ? (
          <div className="review-actions">
            <Form
              action={decideSubmission}
              submit="Approve work"
              confirm="Approve this submission? Your decision, name and time will be recorded."
            >
              <Hidden name="submission" value={submission.id} />
              <Hidden name="choice" value="approved" />
              <Hidden name="feedback" value="" />
            </Form>
            <details className="review-change-details">
              <summary>Request changes</summary>
              <Form action={decideSubmission} submit="Send change request">
                <Hidden name="submission" value={submission.id} />
                <Hidden name="choice" value="changes_requested" />
                <Textarea
                  label="What needs to change?"
                  name="feedback"
                  required
                  placeholder="Be specific so we can get it right."
                />
              </Form>
            </details>
          </div>
        ) : (
          <p className="notice">
            {readOnly
              ? "This project is read-only."
              : "Waiting for the assigned client to review this submission."}
          </p>
        ))
      )}
    </article>
  );
}

