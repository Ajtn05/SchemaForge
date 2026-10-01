import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { Specialization } from "../../domain/types";
import { useProject } from "../../store/useProject";
export function SpecializationEdge(
  props: EdgeProps<Edge<{ specialization: Specialization }, "specialization">>,
) {
  const [path, x, y] = getSmoothStepPath({
    ...props,
    borderRadius: 12,
    offset: 25,
  });
  const group = props.data!.specialization;
  const select = useProject((s) => s.select);
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: props.selected ? "var(--accent)" : "var(--edge)",
          strokeWidth: group.completeness === "total" ? 3 : 1.8,
          strokeDasharray: "7 4",
        }}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <button
          className={`relationship-label specialization-label nodrag nopan ${props.selected ? "selected" : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
          }}
          onClick={() => select({ kind: "specialization", id: group.id })}
        >
          ISA{" "}
          <span>
            {group.exclusivity === "disjoint" ? "d" : "o"} ·{" "}
            {group.completeness}
          </span>
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
