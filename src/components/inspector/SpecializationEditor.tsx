import { GitBranch, Plus, Trash2 } from "lucide-react";
import { useProject } from "../../store/useProject";
import type { Specialization } from "../../domain/types";
import { toRelational } from "../../lib/transform";
export function SpecializationEditor({ group }: { group: Specialization }) {
  const { schema, updateSpecialization, select, mutate } = useProject();
  const parent = schema.entities.find((e) => e.id === group.supertypeId);
  return (
    <div className="specialization-editor">
      <h3>
        <GitBranch size={15} /> Specialization of {parent?.name}
      </h3>
      <label className="field-label" htmlFor={`exclusive-${group.id}`}>
        SUBTYPE MEMBERSHIP
      </label>
      <select
        id={`exclusive-${group.id}`}
        value={group.exclusivity}
        onChange={(e) =>
          updateSpecialization(group.id, {
            exclusivity: e.target.value as Specialization["exclusivity"],
          })
        }
      >
        <option value="disjoint">Disjoint — one subtype at most</option>
        <option value="overlapping">
          Overlapping — multiple subtypes allowed
        </option>
      </select>
      <label className="field-label" htmlFor={`complete-${group.id}`}>
        COMPLETENESS
      </label>
      <select
        id={`complete-${group.id}`}
        value={group.completeness}
        onChange={(e) =>
          updateSpecialization(group.id, {
            completeness: e.target.value as Specialization["completeness"],
          })
        }
      >
        <option value="partial">Partial — subtype membership optional</option>
        <option value="total">Total — every parent must have a subtype</option>
      </select>
      <div className="subtype-list">
        {group.subtypeIds.map((id) => (
          <button
            className="inspector-relationship"
            key={id}
            onClick={() => select({ kind: "entity", id })}
          >
            <GitBranch size={14} />
            {schema.entities.find((e) => e.id === id)?.name ?? "Missing entity"}
          </button>
        ))}
      </div>
      <p className="model-hint">
        Shared-key foreign keys enforce parent membership.{" "}
        {group.exclusivity === "disjoint" || group.completeness === "total"
          ? "Disjointness and total membership need application enforcement; see Validation and SQL notes."
          : "Overlapping, partial membership needs no additional membership constraint."}
      </p>
      <button
        className="button danger subtle full"
        onClick={() => {
          mutate((s) => {
            s.specializations = s.specializations?.filter(
              (g) => g.id !== group.id,
            );
          });
          select({ kind: "entity", id: group.supertypeId });
        }}
      >
        <Trash2 size={13} />
        Remove hierarchy links
      </button>
    </div>
  );
}
export function EntityInheritance({ entityId }: { entityId: string }) {
  const { schema, setSupertype, addSubtype } = useProject();
  const parentGroup = schema.specializations?.find((g) =>
    g.subtypeIds.includes(entityId),
  );
  const ownGroup = schema.specializations?.find(
    (g) => g.supertypeId === entityId,
  );
  const inherited =
    toRelational(schema)
      .tables.find((t) => t.id === entityId)
      ?.columns.filter((c) => c.primaryKey && c.references) ?? [];
  const isDescendant = (id: string) => {
    let current: string | undefined = id;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === entityId) return true;
      seen.add(current);
      current = schema.specializations?.find((g) =>
        g.subtypeIds.includes(current!),
      )?.supertypeId;
    }
    return false;
  };
  return (
    <div className="inspector-section">
      <h3>Inheritance</h3>
      <label className="field-label" htmlFor="supertype">
        SUPERTYPE
      </label>
      <select
        id="supertype"
        value={parentGroup?.supertypeId ?? ""}
        onChange={(e) => setSupertype(entityId, e.target.value)}
      >
        <option value="">None — independent entity</option>
        {schema.entities
          .filter((e) => !isDescendant(e.id))
          .map((e) => (
            <option value={e.id} key={e.id}>
              {e.name}
            </option>
          ))}
      </select>
      <p className="model-hint">
        Subtypes inherit identity and shared attributes from their parent.
        Assigning a parent changes local primary keys to regular attributes.
      </p>
      {inherited.length > 0 && (
        <div className="inherited-key">
          <strong>Inherited PK / FK</strong>
          <span>{inherited.map((c) => c.name).join(", ")}</span>
          <small>Shared attributes live in the parent table.</small>
        </div>
      )}
      {parentGroup && <SpecializationEditor group={parentGroup} />}
      {ownGroup && <SpecializationEditor group={ownGroup} />}
      <button
        className="add-attribute-button"
        onClick={() => addSubtype(entityId)}
      >
        <Plus size={14} />
        Add subtype
      </button>
    </div>
  );
}
