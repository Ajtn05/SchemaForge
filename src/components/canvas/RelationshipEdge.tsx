import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { Relationship } from "../../domain/types";
import { useProject } from "../../store/useProject";
import { cardinalityLabel, relationshipEndpoints } from "../../lib/cardinality";
import { CrowFootEndpoint } from "./CrowFoot";
export type RelationshipFlowEdge = Edge<
  { relationship: Relationship },
  "relationship"
>;
export function RelationshipEdge(props: EdgeProps<RelationshipFlowEdge>) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    id,
    data,
  } = props;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 48,
  });
  const r = data!.relationship;
  const { select, schema } = useProject();
  const endpoints = relationshipEndpoints(r);
  const sourceName =
    schema.entities.find((e) => e.id === r.sourceId)?.name ?? "source";
  const targetName =
    schema.entities.find((e) => e.id === r.targetId)?.name ?? "target";
  const description = `${r.name}: each ${sourceName} relates to ${cardinalityLabel(endpoints.target)} ${targetName}; each ${targetName} relates to ${cardinalityLabel(endpoints.source)} ${sourceName}`;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? "var(--accent)" : "var(--edge)",
          strokeWidth: selected ? 2 : 1.6,
        }}
        interactionWidth={24}
      />
      <CrowFootEndpoint
        x={sourceX}
        y={sourceY}
        position={sourcePosition}
        cardinality={endpoints.source}
        selected={selected}
        side="source"
      />
      <CrowFootEndpoint
        x={targetX}
        y={targetY}
        position={targetPosition}
        cardinality={endpoints.target}
        selected={selected}
        side="target"
      />
      <EdgeLabelRenderer>
        <button
          className={`relationship-label nodrag nopan ${selected ? "selected" : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          title={description}
          aria-label={description}
          onClick={() => select({ kind: "relationship", id })}
        >
          {r.name}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
