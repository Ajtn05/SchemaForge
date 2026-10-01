import { useState } from "react";
import {
  Table2,
  X,
  Plus,
  KeyRound,
  Fingerprint,
  ChevronRight,
  ArrowLeft,
  Copy,
  Trash2,
  GitBranch,
  Info,
  CircleCheck,
  Link2,
  Layers3,
} from "lucide-react";
import { useProject } from "../../store/useProject";
import type { Attribute, Entity, Relationship } from "../../domain/types";
import { DATA_TYPES } from "../../domain/types";
import {
  cardinalityLabel,
  relationshipEndpoints,
  attributeLabel,
} from "../../lib/cardinality";
import { CrowFootKey } from "../canvas/CrowFoot";
import { projectEngine } from "../../lib/engine";
import { sqlType } from "../../lib/mysql";
import { foreignKeySide } from "../../lib/transform";
import {
  EntityInheritance,
  SpecializationEditor,
} from "./SpecializationEditor";
import { IconButton } from "../ui/primitives";
function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`toggle ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
function AttributeEditor({
  attribute: a,
  ownerId,
  relationship,
}: {
  attribute: Attribute;
  ownerId: string;
  relationship: boolean;
}) {
  const { updateAttribute, deleteAttribute, select, addAttribute } =
    useProject();
  const engine = useProject((s) => projectEngine(s.schema));
  const associationKey = useProject(
    (s) =>
      relationship &&
      s.schema.relationships.find((r) => r.id === ownerId)?.cardinality ===
        "M:N",
  );
  const isSubtype = useProject(
    (s) =>
      !relationship &&
      !!s.schema.specializations?.some((g) => g.subtypeIds.includes(ownerId)),
  );
  const change = (changes: Partial<Attribute>) =>
    updateAttribute(ownerId, a.id, changes, relationship);
  return (
    <>
      <button
        className="back-link"
        onClick={() =>
          select({
            kind: relationship ? "relationship" : "entity",
            id: ownerId,
          })
        }
      >
        <ArrowLeft size={14} />
        Back to {relationship ? "relationship" : "entity"}
      </button>
      <div className="inspector-heading">
        <span className="inspector-entity-icon">
          <KeyRound size={19} />
        </span>
        <div>
          <h2>Attribute properties</h2>
          <p>
            {a.primaryKey
              ? "Primary key"
              : a.derived
                ? "Derived attribute"
                : "Entity attribute"}
          </p>
        </div>
      </div>
      <div className="inspector-section">
        <label className="field-label" htmlFor="attribute-name">
          ATTRIBUTE NAME
        </label>
        <input
          id="attribute-name"
          key={a.id}
          autoFocus
          value={a.name}
          onChange={(event) => change({ name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addAttribute(ownerId, relationship);
            }
          }}
        />
        <label className="field-label" htmlFor="attribute-type">
          DATA TYPE
        </label>
        <select
          id="attribute-type"
          value={a.type}
          onChange={(event) =>
            change({
              type: event.target.value as Attribute["type"],
              length: 255,
              precision: 10,
              scale: 2,
            })
          }
        >
          {DATA_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {a.type === "VARCHAR" && (
          <>
            <label className="field-label" htmlFor="length">
              LENGTH
            </label>
            <input
              id="length"
              type="number"
              min={1}
              max={engine === "mysql" ? 16383 : undefined}
              value={a.length ?? 255}
              onChange={(e) => change({ length: Number(e.target.value) })}
            />
          </>
        )}
        {a.type === "DECIMAL" && (
          <div className="field-pair">
            <label>
              PRECISION
              <input
                aria-label="Precision"
                type="number"
                min={1}
                max={engine === "mysql" ? 65 : 1000}
                value={a.precision ?? 10}
                onChange={(e) => change({ precision: Number(e.target.value) })}
              />
            </label>
            <label>
              SCALE
              <input
                aria-label="Scale"
                type="number"
                min={0}
                max={engine === "mysql" ? 30 : 1000}
                value={a.scale ?? 2}
                onChange={(e) => change({ scale: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
        <label className="field-label" htmlFor="default-value">
          DEFAULT VALUE <span>Optional</span>
        </label>
        <input
          id="default-value"
          placeholder="No default"
          value={a.defaultValue ?? ""}
          onChange={(e) => change({ defaultValue: e.target.value })}
        />
      </div>
      <div className="inspector-section">
        <h3>Constraints</h3>
        {(!relationship || associationKey || a.primaryKey) && (
          <Toggle
            label="Primary key"
            hint={
              isSubtype
                ? "Identity is inherited from the supertype"
                : associationKey
                  ? "Extend the association key for repeated pairs, such as Semester"
                  : undefined
            }
            disabled={isSubtype && !a.primaryKey}
            checked={a.primaryKey}
            onChange={(primaryKey) => change({ primaryKey })}
          />
        )}
        <Toggle
          label="Unique"
          checked={a.unique}
          onChange={(unique) => change({ unique })}
        />
        <Toggle
          label="Required (NOT NULL)"
          checked={!a.nullable}
          disabled={a.primaryKey}
          onChange={(required) => change({ nullable: !required })}
        />
        {!relationship && (
          <Toggle
            label={
              engine === "postgresql" ? "Generated identity" : "Auto increment"
            }
            disabled={isSubtype && !a.autoIncrement}
            checked={a.autoIncrement}
            onChange={(autoIncrement) => change({ autoIncrement })}
          />
        )}
      </div>
      <div className="inspector-section">
        <h3>Conceptual properties</h3>
        {!relationship && (
          <Toggle
            label="Multivalued"
            hint="Store multiple values in a separate relation"
            checked={a.multivalued}
            onChange={(multivalued) => change({ multivalued })}
          />
        )}
        <Toggle
          label="Derived"
          hint="Calculate this value from other attributes"
          checked={a.derived}
          onChange={(derived) => change({ derived })}
        />
        {a.derived && (
          <Toggle
            label="Store derived value"
            checked={a.storeDerived}
            onChange={(storeDerived) => change({ storeDerived })}
          />
        )}
      </div>
      <div className="inspector-section">
        <div className="info-callout">
          <Info size={15} />
          <p>
            Press <kbd>Enter</kbd> in the name field to add the next attribute.
          </p>
        </div>
        <button
          className="button danger subtle full"
          onClick={() => deleteAttribute(ownerId, a.id, relationship)}
        >
          <Trash2 size={14} />
          Delete attribute
        </button>
      </div>
    </>
  );
}
function AttributeList({
  owner,
  relationship = false,
}: {
  owner: Entity | Relationship;
  relationship?: boolean;
}) {
  const { schema, select, addAttribute } = useProject();
  return (
    <>
      <div className="section-heading">
        <h3>
          Attributes <span>{owner.attributes.length}</span>
        </h3>
        <IconButton
          label="Add attribute"
          onClick={() => addAttribute(owner.id, relationship)}
        >
          <Plus size={15} />
        </IconButton>
      </div>
      <div className="inspector-attribute-list">
        {owner.attributes.map((a) => (
          <button
            className="inspector-attribute"
            key={a.id}
            onClick={() =>
              select({
                kind: relationship ? "relationship" : "entity",
                id: owner.id,
                attributeId: a.id,
              })
            }
          >
            <span className={a.primaryKey ? "key-icon" : ""}>
              {a.primaryKey ? (
                <KeyRound size={13} />
              ) : a.unique ? (
                <Fingerprint size={13} />
              ) : (
                <span className="attr-bullet" />
              )}
            </span>
            <span className="inspector-attribute-name">
              {attributeLabel(a)}
              <small>{sqlType(a, projectEngine(schema))}</small>
            </span>
            {a.primaryKey ? (
              <span className="tag tag-orange">PK</span>
            ) : a.unique ? (
              <span className="tag">UQ</span>
            ) : null}
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
      <button
        className="add-attribute-button"
        onClick={() => addAttribute(owner.id, relationship)}
      >
        <Plus size={14} />
        Add attribute
      </button>
    </>
  );
}
function EntityInspector({ entity: e }: { entity: Entity }) {
  const { schema, updateEntity, select, duplicate, removeSelection } =
    useProject();
  const [tab, setTab] = useState("properties");
  const related = schema.relationships.filter(
    (r) => r.sourceId === e.id || r.targetId === e.id,
  );
  return (
    <>
      <div className="inspector-heading">
        <span className={`inspector-entity-icon color-${e.color}`}>
          <Table2 size={19} />
        </span>
        <div>
          <h2>{e.name}</h2>
          <p>Conceptual entity</p>
        </div>
        <span className="tag">Entity</span>
      </div>
      <div className="inspector-tabs">
        <button
          className={tab === "properties" ? "active" : ""}
          onClick={() => setTab("properties")}
        >
          Properties
        </button>
        <button
          className={tab === "relationships" ? "active" : ""}
          onClick={() => setTab("relationships")}
        >
          Relationships <span>{related.length}</span>
        </button>
      </div>
      {tab === "properties" ? (
        <>
          <div className="inspector-section">
            <label className="field-label" htmlFor="entity-name">
              ENTITY NAME
            </label>
            <input
              id="entity-name"
              value={e.name}
              onChange={(event) =>
                updateEntity(e.id, { name: event.target.value })
              }
            />
            <label className="field-label" htmlFor="entity-description">
              DESCRIPTION <span>Optional</span>
            </label>
            <textarea
              id="entity-description"
              rows={2}
              value={e.description}
              placeholder="What does this entity represent?"
              onChange={(event) =>
                updateEntity(e.id, { description: event.target.value })
              }
            />
            <div className="field-label">ENTITY COLOR</div>
            <div className="color-options">
              {["orange", "blue", "purple", "green", "pink", "slate"].map(
                (color) => (
                  <button
                    key={color}
                    className={`color-swatch color-${color} ${e.color === color ? "selected" : ""}`}
                    aria-label={`${color} entity color`}
                    onClick={() => updateEntity(e.id, { color })}
                  >
                    {e.color === color && <CircleCheck size={15} />}
                  </button>
                ),
              )}
            </div>
          </div>
          <EntityInheritance entityId={e.id} />
          <div className="inspector-section">
            <AttributeList owner={e} />
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h3>
                Relationships <span>{related.length}</span>
              </h3>
              <GitBranch size={15} />
            </div>
            {related.map((r) => (
              <button
                className="inspector-relationship"
                key={r.id}
                onClick={() => select({ kind: "relationship", id: r.id })}
              >
                <Link2 size={14} />
                <span>{r.name}</span>
                <span className="tag">{r.cardinality}</span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="inspector-section inspector-actions">
            <button className="button subtle" onClick={duplicate}>
              <Copy size={14} />
              Duplicate
            </button>
            <IconButton label="Delete entity" onClick={removeSelection}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </>
      ) : (
        <div className="inspector-section">
          {related.length ? (
            related.map((r) => (
              <button
                className="relationship-detail-card"
                key={r.id}
                onClick={() => select({ kind: "relationship", id: r.id })}
              >
                <div>
                  <GitBranch size={15} />
                  <strong>{r.name}</strong>
                  <span className="tag">{r.cardinality}</span>
                </div>
                <p>
                  {schema.entities.find((t) => t.id === r.sourceId)?.name} →{" "}
                  {schema.entities.find((t) => t.id === r.targetId)?.name}
                </p>
              </button>
            ))
          ) : (
            <div className="info-callout">
              <Info size={15} />
              <p>
                Drag an entity handle to another entity to create a
                relationship.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function RelationshipInspector({
  relationship: r,
}: {
  relationship: Relationship;
}) {
  const { schema, updateRelationship, removeSelection } = useProject();
  const change = (changes: Partial<Relationship>) =>
    updateRelationship(r.id, changes);
  const endpoints = relationshipEndpoints(r);
  const sourceName =
    schema.entities.find((e) => e.id === r.sourceId)?.name ?? "source";
  const targetName =
    schema.entities.find((e) => e.id === r.targetId)?.name ?? "target";
  const side = foreignKeySide(r);
  const owner = side === "source" ? r.sourceId : r.targetId;
  return (
    <>
      <div className="inspector-heading">
        <span className="inspector-entity-icon">
          <GitBranch size={19} />
        </span>
        <div>
          <h2>{r.name}</h2>
          <p>Conceptual relationship</p>
        </div>
      </div>
      <div className="inspector-section">
        <label className="field-label" htmlFor="relationship-name">
          RELATIONSHIP NAME
        </label>
        <input
          id="relationship-name"
          value={r.name}
          onChange={(e) => change({ name: e.target.value })}
        />
        <label className="field-label" htmlFor="source-entity">
          SOURCE ENTITY <span>1-side for 1:N</span>
        </label>
        <select
          id="source-entity"
          value={r.sourceId}
          onChange={(e) => change({ sourceId: e.target.value })}
        >
          {schema.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="target-entity">
          TARGET ENTITY <span>N-side for 1:N</span>
        </label>
        <select
          id="target-entity"
          value={r.targetId}
          onChange={(e) => change({ targetId: e.target.value })}
        >
          {schema.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="inspector-section">
        <h3>Cardinality</h3>
        <div className="cardinality-options">
          {(["1:1", "1:N", "M:N"] as const).map((cardinality) => (
            <button
              className={r.cardinality === cardinality ? "active" : ""}
              key={cardinality}
              onClick={() => change({ cardinality })}
            >
              <strong>{cardinality}</strong>
              <small>
                {cardinality === "1:1"
                  ? "One to one"
                  : cardinality === "1:N"
                    ? "One to many"
                    : "Many to many"}
              </small>
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="source-participation">
          SOURCE PARTICIPATION <span>Does each source need a target?</span>
        </label>
        <select
          id="source-participation"
          value={r.sourceParticipation}
          onChange={(e) =>
            change({
              sourceParticipation: e.target
                .value as Relationship["sourceParticipation"],
            })
          }
        >
          <option value="optional">Optional (zero allowed)</option>
          <option value="mandatory">Mandatory (at least one)</option>
        </select>
        <label className="field-label" htmlFor="target-participation">
          TARGET PARTICIPATION <span>Does each target need a source?</span>
        </label>
        <select
          id="target-participation"
          value={r.targetParticipation}
          onChange={(e) =>
            change({
              targetParticipation: e.target
                .value as Relationship["targetParticipation"],
            })
          }
        >
          <option value="optional">Optional (zero allowed)</option>
          <option value="mandatory">Mandatory (at least one)</option>
        </select>
        <div className="relationship-reading">
          <h3>Read both directions</h3>
          <p>
            <CrowFootKey cardinality={endpoints.target} />
            For one record in <strong>{sourceName}</strong>:{" "}
            {cardinalityLabel(endpoints.target)} in{" "}
            <strong>{targetName}</strong>.
          </p>
          <p>
            <CrowFootKey cardinality={endpoints.source} />
            For one record in <strong>{targetName}</strong>:{" "}
            {cardinalityLabel(endpoints.source)} in{" "}
            <strong>{sourceName}</strong>.
          </p>
        </div>
        {r.cardinality === "1:1" && (
          <>
            <label className="field-label" htmlFor="fk-placement">
              FOREIGN KEY PLACEMENT
            </label>
            <select
              id="fk-placement"
              value={r.fkSide ?? ""}
              onChange={(e) =>
                change({
                  fkSide:
                    e.target.value === ""
                      ? undefined
                      : (e.target.value as "source" | "target"),
                })
              }
            >
              <option value="">Infer from participation</option>
              <option value="source">Source entity</option>
              <option value="target">Target entity</option>
            </select>
          </>
        )}
      </div>
      <div className="inspector-section">
        <AttributeList owner={r} relationship />
      </div>
      <div className="inspector-section">
        <div className="info-callout">
          <Info size={15} />
          <p>
            {r.cardinality === "M:N"
              ? `An associative table named ${r.name} will link these entities using a composite primary key.`
              : side
                ? `The foreign key will be added to ${schema.entities.find((e) => e.id === owner)?.name} in the relational model.${r.cardinality === "1:1" ? " A UNIQUE constraint preserves one-to-one cardinality." : ""}`
                : "Choose foreign key placement to resolve this relationship."}
          </p>
        </div>
        <button className="button danger subtle full" onClick={removeSelection}>
          <Trash2 size={14} />
          Delete relationship
        </button>
      </div>
    </>
  );
}
export default function Inspector() {
  const { schema, selection, select, inspectorOpen, setInspectorOpen } =
    useProject();
  const entity =
    selection?.kind === "entity"
      ? schema.entities.find((e) => e.id === selection.id)
      : undefined;
  const relationship =
    selection?.kind === "relationship"
      ? schema.relationships.find((r) => r.id === selection.id)
      : undefined;
  const owner = entity ?? relationship;
  const attr = owner?.attributes.find((a) => a.id === selection?.attributeId);
  return (
    <>
      <button
        className={`inspector-backdrop ${inspectorOpen ? "visible" : ""}`}
        aria-label="Close mobile inspector"
        onClick={() => setInspectorOpen(false)}
      />
      <aside className={`inspector ${inspectorOpen ? "mobile-open" : ""}`}>
        <div className="inspector-top">
          <span>INSPECTOR</span>
          <IconButton label="Clear selection" onClick={() => select(null)}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="inspector-scroll">
          {attr && owner ? (
            <AttributeEditor
              key={attr.id}
              attribute={attr}
              ownerId={owner.id}
              relationship={!!relationship}
            />
          ) : entity ? (
            <EntityInspector key={entity.id} entity={entity} />
          ) : selection?.kind === "specialization" &&
            schema.specializations?.find((g) => g.id === selection.id) ? (
            <div className="inspector-section">
              <SpecializationEditor
                group={schema.specializations.find(
                  (g) => g.id === selection.id,
                )!}
              />
            </div>
          ) : relationship ? (
            <RelationshipInspector relationship={relationship} />
          ) : (
            <div className="inspector-empty">
              <span className="empty-icon">
                <Layers3 size={28} />
              </span>
              <h2>A closer look</h2>
              <p>
                Select an entity, attribute, or relationship to explore its
                properties.
              </p>
              <div className="inspector-empty-tip">
                <Info size={16} />
                <p>
                  Your EER diagram is the source of truth. Relational tables and
                  SQL update as you design.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="inspector-foot">
          <span className="live-dot" />
          Changes update your schema instantly
        </div>
      </aside>
    </>
  );
}
