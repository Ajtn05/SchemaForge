import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  Panel,
  useReactFlow,
  useViewport,
  SelectionMode,
  type NodeChange,
} from "@xyflow/react";
import {
  MousePointer2,
  Hand,
  Plus,
  Minus,
  Maximize,
  Table2,
  GitBranch,
  Scan,
  LayoutGrid,
} from "lucide-react";
import { useProject } from "../../store/useProject";
import { EntityNode, type EntityFlowNode } from "./EntityNode";
import { AssociativeNode, type AssociativeFlowNode } from "./AssociativeNode";
import { SpecializationEdge } from "./SpecializationEdge";
import { RelationshipEdge } from "./RelationshipEdge";
import { toRelational } from "../../lib/transform";
import { associativeTableNodes } from "../../lib/diagram";
import { IconButton } from "../ui/primitives";
type DiagramNode = EntityFlowNode | AssociativeFlowNode;
const nodeTypes = { entity: EntityNode, associative: AssociativeNode };
const edgeTypes = {
  relationship: RelationshipEdge,
  specialization: SpecializationEdge,
};
export default function Diagram() {
  const {
    schema,
    selection,
    selectedIds,
    select,
    selectMany,
    connect,
    moveDiagramNodes,
    checkpoint,
    addEntity,
    mutate,
  } = useProject();
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [minimap, setMinimap] = useState(true);
  const [measurements, setMeasurements] = useState<Map<string, { width: number; height: number }>>(() => new Map());
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const relational = useMemo(() => toRelational(schema), [schema]);
  const associative = useMemo(() => associativeTableNodes(schema, relational), [schema, relational]);
  const associativeKey = JSON.stringify(associative.map((n) => n.id));
  const previousAssociativeKey = useRef(associativeKey);
  useEffect(() => {
    const previous = new Set<string>(JSON.parse(previousAssociativeKey.current));
    previousAssociativeKey.current = associativeKey;
    const added = (JSON.parse(associativeKey) as string[]).some((id) => !previous.has(id));
    if (!added) return;
    // Include a newly generated table after React Flow has measured its node.
    const timer = setTimeout(() => {
      flow.fitView({ padding: 0.13, duration: 300, maxZoom: 1 });
    }, 50);
    return () => clearTimeout(timer);
  }, [associativeKey, flow]);
  const nodes = useMemo<DiagramNode[]>(
    () => [
      ...schema.entities.map((e): EntityFlowNode => ({
        id: e.id,
        type: "entity",
        position: e.position,
        measured: measurements.get(e.id),
        data: {
          entity: e,
          inheritedKeys:
            relational.tables
              .find((t) => t.id === e.id)
              ?.columns.filter((c) => c.primaryKey && c.references) ?? [],
        },
        selected: selectedIds.includes(e.id),
      })),
      ...associative.map((n): AssociativeFlowNode => ({
        id: n.id, type: "associative", position: n.position,
        measured: measurements.get(n.id),
        data: { relationship: n.relationship, table: n.table },
        selected: selection?.kind === "relationship" && selection.id === n.relationship.id,
        connectable: false,
      })),
    ],
    [schema.entities, selection, selectedIds, relational, associative, measurements],
  );
  const edges = useMemo(
    () => [
      ...schema.relationships.filter((r) => r.cardinality !== "M:N").map((r) => ({
        id: r.id,
        type: "relationship",
        source: r.sourceId,
        target: r.targetId,
        sourceHandle: r.sourceHandle ?? "right",
        targetHandle: r.targetHandle ?? "left",
        data: { relationship: r },
        selected: selection?.kind === "relationship" && selection.id === r.id,
      })),
      ...associative.flatMap((n) => n.connections.map((c) => ({
        id: c.id, type: "relationship", source: c.source, target: c.target,
        sourceHandle: c.sourceHandle, targetHandle: c.targetHandle,
        data: { relationship: c.relationship,
          sourceName: c.sourceName, targetName: c.targetName, hideLabel: true },
        ariaLabel: `${c.sourceName} to ${c.targetName}`,
        selected: selection?.kind === "relationship" && selection.id === n.relationship.id,
      }))),
      ...(schema.specializations ?? []).flatMap((g) =>
        g.subtypeIds.map((id) => ({
          id: `isa-${g.id}-${id}`,
          type: "specialization",
          source: g.supertypeId,
          target: id,
          sourceHandle: "bottom",
          targetHandle: "top",
          data: { specialization: g },
          selected:
            selection?.kind === "specialization" && selection.id === g.id,
        })),
      ),
    ],
    [schema.relationships, schema.specializations, selection, associative],
  );
  const nodeSelection = (node: DiagramNode) => node.type === "associative"
    ? { kind: "relationship" as const, id: node.data.relationship.id }
    : { kind: "entity" as const, id: node.id };
  const changes = (changes: NodeChange<DiagramNode>[]) => {
    // Preserve measured dimensions when controlled nodes are rebuilt after an edit.
    if (changes.some((c) => c.type === "dimensions" && c.dimensions)) {
      setMeasurements((previous) => {
        const next = new Map(previous);
        let changed = false;
        for (const c of changes) {
          if (c.type !== "dimensions" || !c.dimensions) continue;
          const size = previous.get(c.id);
          if (size?.width === c.dimensions.width && size?.height === c.dimensions.height) continue;
          next.set(c.id, c.dimensions);
          changed = true;
        }
        return changed ? next : previous;
      });
    }
    const positions = changes.flatMap((c) => {
      if (c.type !== "position" || !c.position) return [];
      const node = nodes.find((n) => n.id === c.id);
      return node ? [{ ...nodeSelection(node), position: c.position }] : [];
    });
    if (positions.length) moveDiagramNodes(positions);
  };
  function addCentered() {
    const el = document.querySelector(".diagram");
    const rect = el?.getBoundingClientRect();
    const id = addEntity(
      rect
        ? flow.screenToFlowPosition({
            x: rect.x + rect.width / 2 - 120,
            y: rect.y + rect.height / 2 - 80,
          })
        : undefined,
    );
    setTimeout(
      () => flow.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1 }),
      50,
    );
  }
  function arrange() {
    mutate((s) => {
      s.entities.forEach((e, i) => {
        e.position = { x: 60 + (i % 2) * 390, y: 45 + Math.floor(i / 2) * 330 };
      });
      s.relationships.forEach((r) => { r.associativePosition = undefined; });
    });
    setTimeout(
      () => flow.fitView({ padding: 0.13, duration: 300, maxZoom: 1 }),
      50,
    );
  }
  return (
    <div
      className={`diagram tool-${tool}`}
      onDoubleClick={(event) => {
        if (
          (event.target as HTMLElement).classList.contains("react-flow__pane")
        )
          addEntity(
            flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          );
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={changes}
        onNodeDragStart={(_, node) => {
          if (!useProject.getState().selectedIds.includes(node.id))
            select(nodeSelection(node));
          checkpoint();
        }}
        onNodeClick={(event, node) => {
          if (!event.shiftKey || node.type === "associative") {
            select(nodeSelection(node));
            return;
          }
          const ids = useProject.getState().selectedIds;
          selectMany(
            ids.includes(node.id)
              ? ids.filter((id) => id !== node.id)
              : [...ids, node.id],
          );
        }}
        onEdgeClick={(_, edge) => {
          const group =
            "specialization" in edge.data!
              ? edge.data.specialization
              : undefined;
          select(
            group
              ? { kind: "specialization", id: group.id }
              : { kind: "relationship", id: "relationship" in edge.data! ? edge.data.relationship.id : edge.id },
          );
        }}
        onPaneClick={() => select(null)}
        onConnect={(c) => {
          if (!schema.entities.some((e) => e.id === c.source) || !schema.entities.some((e) => e.id === c.target)) return;
          connect(c.source, c.target, {
            sourceHandle: c.sourceHandle ?? undefined,
            targetHandle: c.targetHandle ?? undefined,
          });
        }}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.13, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.7}
        snapToGrid
        snapGrid={[10, 10]}
        elementsSelectable={false}
        selectNodesOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === "pan" ? [0, 1, 2] : [0, 1]}
        selectionOnDrag={false}
        panActivationKeyCode="Space"
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="var(--dot)"
        />
        {schema.entities.length === 0 && (
          <Panel position="top-center" className="empty-diagram">
            <span className="empty-icon">
              <Table2 size={28} />
            </span>
            <h2>Every great database starts here.</h2>
            <p>Add an entity. Give it attributes. Connect the dots.</p>
            <button className="button primary" onClick={addCentered}>
              <Plus size={16} />
              Create your first entity
            </button>
          </Panel>
        )}
        <Panel position="bottom-center">
          <div className="canvas-tools">
            <IconButton
              label="Select · Shift to multi-select"
              aria-pressed={tool === "select"}
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={17} />
            </IconButton>
            <IconButton
              label="Pan · Space + drag"
              aria-pressed={tool === "pan"}
              onClick={() => setTool("pan")}
            >
              <Hand size={17} />
            </IconButton>
            <span className="tool-divider" />
            <IconButton label="Add entity" onClick={addCentered}>
              <Table2 size={17} />
              <span className="tiny-plus">+</span>
            </IconButton>
            <IconButton
              label="Connect entities by dragging a handle"
              onClick={() =>
                useProject
                  .getState()
                  .notify(
                    "Drag a circle on an entity to a circle on another entity.",
                  )
              }
            >
              <GitBranch size={17} />
            </IconButton>
            <span className="tool-divider" />
            <IconButton label="Arrange entities" onClick={arrange}>
              <LayoutGrid size={17} />
            </IconButton>
            <IconButton
              label="Fit diagram to screen"
              onClick={() =>
                flow.fitView({ padding: 0.13, duration: 300, maxZoom: 1 })
              }
            >
              <Scan size={17} />
            </IconButton>
          </div>
        </Panel>
        {minimap && schema.entities.length > 0 && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            maskColor="var(--minimap-mask)"
            nodeColor={(node) => (node.selected ? "#ed966e" : "#d5d3ce")}
            nodeStrokeWidth={0}
            nodeBorderRadius={3}
            style={{ width: 132, height: 85 }}
          />
        )}
        <Panel position="bottom-left">
          <div className="zoom-control">
            <IconButton
              label="Zoom out"
              onClick={() => flow.zoomOut({ duration: 200 })}
            >
              <Minus size={14} />
            </IconButton>
            <button
              onClick={() => flow.zoomTo(1, { duration: 200 })}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton
              label="Zoom in"
              onClick={() => flow.zoomIn({ duration: 200 })}
            >
              <Plus size={14} />
            </IconButton>
            <span className="tool-divider" />
            <IconButton
              label="Toggle minimap"
              onClick={() => setMinimap((v) => !v)}
            >
              <Maximize size={14} />
            </IconButton>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
