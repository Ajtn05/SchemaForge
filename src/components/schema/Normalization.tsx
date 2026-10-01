import { useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import type {
  FunctionalDependency,
  RelationalSchema,
} from "../../domain/types";
import { useProject } from "../../store/useProject";
import { uid } from "../../domain/sample";
import { analyzeNormalization, type NormalForm } from "../../lib/normalization";
export default function Normalization({
  relational,
}: {
  relational: RelationalSchema;
}) {
  const { schema, mutate } = useProject();
  const [selected, setSelected] = useState("");
  const [determinants, setDeterminants] = useState<string[]>([]);
  const [dependents, setDependents] = useState<string[]>([]);
  const table =
    relational.tables.find((t) => t.id === selected) ?? relational.tables[0];
  const dependencies = schema.functionalDependencies ?? [];
  const stale = dependencies.filter(
    (d) => !relational.tables.some((t) => t.id === d.tableId),
  );
  if (!table)
    return (
      <div className="output-empty">Add an entity to check normalization.</div>
    );
  const report = analyzeNormalization(table, dependencies);
  const local = dependencies.filter((d) => d.tableId === table.id);
  const names = (ids: string[]) =>
    ids
      .map(
        (id) =>
          table.columns.find((c) => c.id === id)?.name ?? "Removed column",
      )
      .join(", ");
  const remove = (id: string) =>
    mutate((s) => {
      s.functionalDependencies = s.functionalDependencies?.filter(
        (d) => d.id !== id,
      );
    });
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  const available = new Set(table.columns.map((c) => c.id));
  const left = determinants.filter((id) => available.has(id));
  const right = dependents.filter(
    (id) => available.has(id) && !left.includes(id),
  );
  return (
    <div className="normalization-output">
      <div className="normalization-intro">
        <strong>Normalization review</strong>
        <p>
          Checks use declared functional dependencies and PK / non-null UNIQUE
          constraints. A → B means each A value determines exactly one B value.
          Add your business rules; column names cannot establish them.
        </p>
      </div>
      <label className="field-label" htmlFor="normalization-table">
        RELATIONAL TABLE
      </label>
      <select
        id="normalization-table"
        value={table.id}
        onChange={(e) => {
          setSelected(e.target.value);
          setDeterminants([]);
          setDependents([]);
        }}
      >
        {relational.tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="normal-form-grid">
        <div className="normal-form review">
          <strong>1NF</strong>
          <span>Review atomicity</span>
        </div>
        {(["2NF", "3NF", "BCNF"] as NormalForm[]).map((form) => {
          const fails = report.findings.some((f) => f.form === form);
          const unknown =
            report.invalidDependencyIds.length > 0 ||
            (report.incomplete && form !== "BCNF");
          return (
            <div
              className={`normal-form ${fails ? "violation" : unknown ? "review" : "pass"}`}
              key={form}
            >
              <strong>{form}</strong>
              <span>
                {fails
                  ? "Violation found"
                  : unknown
                    ? "Incomplete review"
                    : "No declared violation"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="model-hint">
        1NF assumes one atomic value per column. Inspect stored lists and
        repeating groups yourself. Results through BCNF assume complete
        dependencies and atomic values; they do not certify your data.
      </p>
      <div className="candidate-keys">
        <strong>
          Candidate keys{" "}
          {report.incomplete ? "(partial search)" : "from known rules"}
        </strong>
        <span>
          {report.candidateKeys.length
            ? report.candidateKeys
                .map((key) => `(${names(key) || "empty set"})`)
                .join(" · ")
            : "Not established"}
        </span>
      </div>
      {report.incomplete && (
        <p className="dependency-warning">
          Search reached its 4,096-state limit. 2NF and 3NF are unresolved;
          refine the model or analyze it externally.
        </p>
      )}
      {report.invalidDependencyIds.length > 0 && (
        <p className="dependency-warning">
          Some dependencies reference removed columns. Remove them and enter the
          current rules.
        </p>
      )}
      <div className="normalization-findings">
        {report.findings.map((f, i) => (
          <div className="normalization-finding" key={i}>
            <strong>
              {f.form} · {names(f.determinant)} → {names(f.dependent)}
            </strong>
            <p>{f.message}</p>
            <small>{f.suggestion}</small>
          </div>
        ))}
      </div>
      <h3>
        Declared dependencies <span className="tag">{local.length}</span>
      </h3>
      {local.length ? (
        local.map((d) => (
          <div className="dependency-row" key={d.id}>
            <span>
              {names(d.determinantIds)} <ArrowRight size={13} />{" "}
              {names(d.dependentIds)}
            </span>
            <button
              className="icon-button"
              aria-label={`Remove dependency ${names(d.determinantIds)} to ${names(d.dependentIds)}`}
              onClick={() => remove(d.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      ) : (
        <p className="model-hint">
          Only key constraints are known. Add non-key dependencies to reveal
          partial or transitive dependencies.
        </p>
      )}
      <form
        className="dependency-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!left.length || !right.length) return;
          const d: FunctionalDependency = {
            id: uid(),
            tableId: table.id,
            determinantIds: left,
            dependentIds: right,
          };
          mutate((s) => {
            s.functionalDependencies ??= [];
            s.functionalDependencies.push(d);
          });
          setDeterminants([]);
          setDependents([]);
        }}
      >
        <div className="dependency-columns">
          <fieldset>
            <legend>Determines (A)</legend>
            {table.columns.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={left.includes(c.id)}
                  onChange={() => setDeterminants(toggle(left, c.id))}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Dependent (B)</legend>
            {table.columns.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  disabled={left.includes(c.id)}
                  checked={right.includes(c.id)}
                  onChange={() => setDependents(toggle(right, c.id))}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
        </div>
        <button
          className="button small"
          disabled={!left.length || !right.length}
          type="submit"
        >
          <Plus size={14} />
          Add dependency
        </button>
      </form>
      {stale.length > 0 && (
        <div className="stale-dependencies">
          <strong>Dependencies for removed tables</strong>
          {stale.map((d) => (
            <div className="dependency-row" key={d.id}>
              <span>Table no longer exists</span>
              <button className="button small" onClick={() => remove(d.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="model-hint">
        Dependencies describe business semantics and are saved with your
        project. They do not add SQL constraints or change your tables
        automatically.
      </p>
    </div>
  );
}
