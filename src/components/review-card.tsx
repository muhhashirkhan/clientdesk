import Link from "next/link";
import { ArrowUpRight, CheckCheck } from "lucide-react";
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
  return (
    <article className="panel review-card">
      <div className="card-top">
        <div>
          <p className="eyebrow">{projectName || "MILESTONE REVIEW"}</p>
          <h2>{title}</h2>
        </div>
        <Badge value={submission.status} />
      </div>
      <p className="preserve">{submission.notes}</p>
      {submission.preview_url && (
        <a
          className="button secondary"
          href={submission.preview_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open preview <ArrowUpRight size={16} />
        </a>
      )}
      <div className="review-meta">
        <span>Submitted by {submission.author_name}</span>
        <time dateTime={submission.created_at}>
          {timestamp(submission.created_at)}
        </time>
      </div>
      <Link
        className="text-link"
        href={"/projects/" + submission.project_id + "?tab=files"}
      >
        View project files <ArrowUpRight size={14} />
      </Link>
      {decision ? (
        <div className="decision-record">
          <CheckCheck size={19} />
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
            <details>
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
