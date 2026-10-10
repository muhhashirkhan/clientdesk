import { session, check } from "@/lib/data";
import { PageHeader, Empty } from "@/components/ui";
import { ReviewCard } from "@/components/review-card";
import type { Submission, Decision, Milestone, Project } from "@/lib/types";
export default async function Approvals() {
  const { db, profile } = await session();
  const results = await Promise.all([
    db
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false }),
    db.from("decisions").select("*"),
    db.from("milestones").select("*"),
    db.from("projects").select("*"),
  ]);
  results.forEach((r) => check(r.error));
  const submissions = results[0].data as Submission[],
    decisions = results[1].data as Decision[],
    milestones = results[2].data as Milestone[],
    projects = results[3].data as Project[];
  return (
    <>
      <PageHeader
        eyebrow="FEEDBACK THAT MOVES WORK FORWARD"
        title="Approvals"
        description={
          profile.role === "admin"
            ? "Track submitted work, client decisions and requested changes."
            : "Review the work, approve it or tell us what needs another pass."
        }
      />
      {submissions.length ? (
        <div className="review-list">
          {submissions.map((s) => {
            const p = projects.find((p) => p.id === s.project_id);
            return (
              <ReviewCard
                key={s.id}
                submission={s}
                decision={decisions.find((d) => d.submission_id === s.id)}
                title={
                  milestones.find((m) => m.id === s.milestone_id)?.title ||
                  "Milestone"
                }
                projectName={p?.name}
                admin={profile.role === "admin"}
                readOnly={p?.archived || p?.status === "completed"}
              />
            );
          })}
        </div>
      ) : (
        <Empty
          title="Nothing waiting for review."
          description="Submitted milestones will appear here with the work, feedback and approval history."
        />
      )}
    </>
  );
}
