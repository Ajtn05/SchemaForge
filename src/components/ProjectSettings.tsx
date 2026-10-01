import { useState } from "react";
import { useProject } from "../store/useProject";
import type { DatabaseEngine } from "../domain/types";
import { projectEngine } from "../lib/engine";
export default function ProjectSettings({ onClose }: { onClose: () => void }) {
  const { schema, mutate, notify } = useProject();
  const [name, setName] = useState(schema.name);
  const [description, setDescription] = useState(schema.description);
  const [engine, setEngine] = useState<DatabaseEngine>(projectEngine(schema));
  const [crowFoot, setCrowFoot] = useState(
    schema.relationshipNotation === "crow-foot",
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutate((s) => {
          s.name = name.trim() || s.name;
          s.description = description;
          s.engine = engine;
          s.relationshipNotation = crowFoot ? "crow-foot" : "cardinality";
        });
        notify("Project settings saved.");
        onClose();
      }}
    >
      <label className="field-label" htmlFor="settings-name">
        PROJECT NAME
      </label>
      <input
        id="settings-name"
        autoFocus
        value={name}
        required
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field-label" htmlFor="settings-description">
        DESCRIPTION <span>Optional</span>
      </label>
      <textarea
        id="settings-description"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="field-label" htmlFor="database-engine">
        DATABASE ENGINE
      </label>
      <select
        id="database-engine"
        value={engine}
        onChange={(e) => setEngine(e.target.value as DatabaseEngine)}
      >
        <option value="none">No engine</option>
        <option value="mysql">MySQL</option>
        <option value="postgresql">PostgreSQL</option>
      </select>
      <p className="settings-engine-note">
        {engine === "none"
          ? "Design your diagram and relational schema without a SQL target. Choose an engine when you are ready to export SQL."
          : engine === "postgresql"
            ? "Generate PostgreSQL SQL with quoted identifiers and identity columns. Date-time attributes map to TIMESTAMP without time zone."
            : "Generate MySQL 8.0.16+ SQL with InnoDB and utf8mb4."}
      </p>
      <div className="settings-diagram">
        <span className="field-label">DIAGRAM</span>
        <div className="toggle-row">
          <span>
            Use crow’s-foot notation
            <small>Replace 1:1, 1:N, and M:N labels with relationship symbols.</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={crowFoot}
            aria-label="Use crow’s-foot notation"
            className={`toggle ${crowFoot ? "on" : ""}`}
            onClick={() => setCrowFoot(!crowFoot)}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="button" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" type="submit">
          Save settings
        </button>
      </div>
    </form>
  );
}
