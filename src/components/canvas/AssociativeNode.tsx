import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { GitBranch, KeyRound, Link2, Plus, Settings2 } from "lucide-react";
import type { Relationship, RelationalTable } from "../../domain/types";
import { projectEngine } from "../../lib/engine";
import { sqlType } from "../../lib/mysql";
import { useProject } from "../../store/useProject";

export type AssociativeFlowNode = Node<{ relationship: Relationship; table: RelationalTable }, "associative">;
export const AssociativeNode = memo(function AssociativeNode({ data, selected }: NodeProps<AssociativeFlowNode>) {
  const { relationship, table } = data;
  const { schema, select, addAttribute } = useProject();
  return (
    <div className={`entity-node associative-node color-orange ${selected ? "selected" : ""}`}
      onClick={(event) => { if ((event.target as HTMLElement).closest(".nodrag")) event.stopPropagation(); }}>
      <div className="entity-node-header">
        <span className="entity-symbol"><GitBranch size={16} /></span>
        <span className="entity-node-name">{table.name}</span>
        <button className="icon-button nodrag" aria-label={`Edit ${table.name} relationship`}
          onClick={() => select({ kind: "relationship", id: relationship.id })}><Settings2 size={14} /></button>
      </div>
      <div className="node-association-label">Associative table</div>
      <div className="node-column-heading"><span>COLUMN</span><span>TYPE</span></div>
      <div className="node-attributes">
        {table.columns.map((column) => (
          <button key={column.id} className={`node-attribute nodrag ${column.primaryKey ? "is-key" : ""}`}
            title={column.references ? `${column.name} → ${column.references.table}.${column.references.column}` : column.name}
            onClick={() => select({ kind: "relationship", id: relationship.id,
              attributeId: relationship.attributes.some((a) => a.id === column.id) ? column.id : undefined })}>
            <span className="attribute-key">{column.primaryKey ? <KeyRound size={13} /> : column.references ? <Link2 size={13} /> : <span className="attr-bullet" />}</span>
            <span className="attribute-name">{column.name}</span>
            {(column.primaryKey || column.references) && <span className="node-column-key">{[column.primaryKey && "PK", column.references && "FK"].filter(Boolean).join("/")}</span>}
            <span className="attribute-type">{sqlType(column, projectEngine(schema))}</span>
          </button>
        ))}
      </div>
      <button className="node-add-attribute nodrag" onClick={() => addAttribute(relationship.id, true)}><Plus size={13} />Add attribute</button>
      {[["left", Position.Left], ["right", Position.Right]].map(([id, position]) => (
        <Handle key={id as string} id={id as string} type="target" position={position as Position}
          className="entity-handle" isConnectable={false} />
      ))}
    </div>
  );
});
