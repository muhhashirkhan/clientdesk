import { Field, Textarea } from "./forms";
import type { Client, Project } from "@/lib/types";
export function ProjectFields({
  clients,
  project,
}: {
  clients: Client[];
  project?: Project;
}) {
  return (
    <>
      <Field
        label="Project name"
        name="name"
        value={project?.name}
        maxLength={160}
        placeholder="e.g. Website redesign"
      />
      <div className="form-grid">
        <label className="field">
          Client
          <select
            name="client_id"
            required
            defaultValue={project?.client_id || ""}
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? " · " + c.company : ""}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Deadline"
          name="deadline"
          type="date"
          value={project?.deadline || ""}
          required={false}
        />
      </div>
      <Textarea
        label="Agreed scope"
        name="scope"
        value={project?.scope}
        maxLength={12000}
        placeholder="Describe the agreed deliverables, boundaries and requirements."
      />
      <label className="field">
        Status
        <select name="status" defaultValue={project?.status || "active"}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
      </label>
    </>
  );
}
