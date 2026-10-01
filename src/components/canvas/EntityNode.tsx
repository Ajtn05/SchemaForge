import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Table2,
  KeyRound,
  Plus,
  MoreHorizontal,
  Copy,
  Trash2,
  Fingerprint,
  CircleDashed,
} from "lucide-react";
import type { Entity, RelationalColumn } from "../../domain/types";
import { attributeLabel } from "../../lib/cardinality";
import { projectEngine } from "../../lib/engine";
import { sqlType } from "../../lib/mysql";
import { useProject } from "../../store/useProject";
import { Menu, MenuItem } from "../ui/primitives";
export type EntityFlowNode = Node<
  { entity: Entity; inheritedKeys?: RelationalColumn[] },
  "entity"
>;
export const EntityNode = memo(function EntityNode({
  data,
  selected,
}: NodeProps<EntityFlowNode>) {
  const e = data.entity;
  const engine = useProject((s) => projectEngine(s.schema));
  const [renaming, setRenaming] = useState(false);
  const { updateEntity, addAttribute, select, duplicate, removeSelection } =
    useProject();
  const parent = useProject((s) =>
    s.schema.specializations?.find((g) => g.subtypeIds.includes(e.id)),
  );
  return (
    <div
      className={`entity-node color-${e.color} ${selected ? "selected" : ""}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(".nodrag"))
          event.stopPropagation();
      }}
    >
      <div className="entity-node-header">
        <span className="entity-symbol">
          <Table2 size={16} />
        </span>
        {renaming ? (
          <input
            className="node-rename nodrag"
            autoFocus
            defaultValue={e.name}
            onBlur={(event) => {
              updateEntity(e.id, { name: event.target.value });
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span
            className="entity-node-name"
            onDoubleClick={() => setRenaming(true)}
          >
            {e.name}
          </span>
        )}
        <span className="node-count">{e.attributes.length}</span>
        <span className="nodrag">
          <Menu
            label={`Actions for ${e.name}`}
            trigger={<MoreHorizontal size={16} />}
          >
            <MenuItem onSelect={() => setRenaming(true)}>
              Rename entity
            </MenuItem>
            <MenuItem
              onSelect={() => {
                select({ kind: "entity", id: e.id });
                duplicate();
              }}
            >
              <Copy size={14} />
              Duplicate
            </MenuItem>
            <MenuItem
              danger
              onSelect={() => {
                select({ kind: "entity", id: e.id });
                removeSelection();
              }}
            >
              <Trash2 size={14} />
              Delete entity
            </MenuItem>
          </Menu>
        </span>
      </div>
      {parent && (
        <div className="node-inheritance">ISA · inherited PK / FK</div>
      )}
      <div className="node-column-heading">
        <span>ATTRIBUTE</span>
        <span>TYPE</span>
      </div>
      <div className="node-attributes">
        {data.inheritedKeys?.map((a) => (
          <button
            className="node-attribute is-key inherited-attribute nodrag"
            key={a.id}
            title={`Inherited from ${a.references?.table}`}
            onClick={() =>
              parent && select({ kind: "entity", id: parent.supertypeId })
            }
          >
            <span className="attribute-key">
              <KeyRound size={13} />
            </span>
            <span className="attribute-name">
              {a.name} <small>PK/FK</small>
            </span>
            <span className="attribute-type">{sqlType(a, engine)}</span>
          </button>
        ))}
        {e.attributes.map((a) => (
          <button
            className={`node-attribute nodrag ${a.primaryKey ? "is-key" : ""}`}
            key={a.id}
            onClick={() =>
              select({ kind: "entity", id: e.id, attributeId: a.id })
            }
          >
            <span className="attribute-key">
              {a.primaryKey ? (
                <KeyRound size={13} />
              ) : a.unique ? (
                <Fingerprint size={13} />
              ) : a.derived ? (
                <CircleDashed size={13} />
              ) : (
                <span className="attr-bullet" />
              )}
            </span>
            <span className="attribute-name">{attributeLabel(a)}</span>
            <span className="attribute-type">{sqlType(a, engine)}</span>
          </button>
        ))}
      </div>
      <button
        className="node-add-attribute nodrag"
        onClick={() => addAttribute(e.id)}
      >
        <Plus size={13} />
        Add attribute
      </button>
      {[
        ["left", Position.Left],
        ["right", Position.Right],
        ["top", Position.Top],
        ["bottom", Position.Bottom],
      ].map(([id, position]) => (
        <Handle
          key={id as string}
          id={id as string}
          type="source"
          position={position as Position}
          className="entity-handle"
          title="Drag to connect entities"
        />
      ))}
    </div>
  );
});
