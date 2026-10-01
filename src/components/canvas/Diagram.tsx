import { useMemo, useState } from "react";
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
  Info,
} from "lucide-react";
import { useProject } from "../../store/useProject";
import { EntityNode, type EntityFlowNode } from "./EntityNode";
import { SpecializationEdge } from "./SpecializationEdge";
import { RelationshipEdge } from "./RelationshipEdge";
import { toRelational } from "../../lib/transform";
import { CrowFootKey } from "./CrowFoot";
import {
  cardinalityLabel,
  type EndpointCardinality,
} from "../../lib/cardinality";
import { IconButton } from "../ui/primitives";
const nodeTypes = { entity: EntityNode };
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
    moveEntities,
    checkpoint,
    addEntity,
    mutate,
  } = useProject();
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [minimap, setMinimap] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const relational = useMemo(() => toRelational(schema), [schema]);
  const nodes = useMemo<EntityFlowNode[]>(
    () =>
      schema.entities.map((e) => ({
        id: e.id,
        type: "entity",
        position: e.position,
        data: {
          entity: e,
          inheritedKeys:
            relational.tables
              .find((t) => t.id === e.id)
              ?.columns.filter((c) => c.primaryKey && c.references) ?? [],
        },
        selected: selectedIds.includes(e.id),
      })),
    [schema.entities, selection, selectedIds, relational],
  );
  const edges = useMemo(
    () => [
      ...schema.relationships.map((r) => ({
        id: r.id,
        type: "relationship",
        source: r.sourceId,
        target: r.targetId,
        sourceHandle: r.sourceHandle ?? "right",
        targetHandle: r.targetHandle ?? "left",
        data: { relationship: r },
        selected: selection?.kind === "relationship" && selection.id === r.id,
      })),
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
    [schema.relationships, schema.specializations, selection],
  );
  const changes = (changes: NodeChange<EntityFlowNode>[]) => {
    const positions = changes.flatMap((c) =>
      c.type === "position" && c.position
        ? [{ id: c.id, position: c.position }]
        : [],
    );
    if (positions.length) moveEntities(positions);
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
    mutate((s) =>
      s.entities.forEach((e, i) => {
        e.position = { x: 60 + (i % 2) * 390, y: 45 + Math.floor(i / 2) * 330 };
      }),
    );
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
            select({ kind: "entity", id: node.id });
          checkpoint();
        }}
        onNodeClick={(event, node) => {
          if (!event.shiftKey) {
            select({ kind: "entity", id: node.id });
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
              : { kind: "relationship", id: edge.id },
          );
        }}
        onPaneClick={() => select(null)}
        onConnect={(c) =>
          connect(c.source, c.target, {
            sourceHandle: c.sourceHandle ?? undefined,
            targetHandle: c.targetHandle ?? undefined,
          })
        }
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
        <Panel position="top-left">
          <div className="canvas-tag">
            <span className="live-dot" />
            CONCEPTUAL MODEL
            <span className="canvas-tag-separator" />
            Editable
          </div>
        </Panel>
        <Panel position="top-right" className="notation-panel">
          <button
            className="notation-trigger"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((open) => !open)}
          >
            <Info size={13} />
            Crow’s foot
          </button>
          {legendOpen && (
            <div className="notation-legend">
              <strong>Read the end next to the related entity</strong>
              {(
                [
                  { minimum: 0, maximum: 1 },
                  { minimum: 1, maximum: 1 },
                  { minimum: 0, maximum: "many" },
                  { minimum: 1, maximum: "many" },
                ] as EndpointCardinality[]
              ).map((c) => (
                <div key={`${c.minimum}-${c.maximum}`}>
                  <CrowFootKey cardinality={c} />
                  <span>{cardinalityLabel(c)}</span>
                </div>
              ))}
              <p>Circle = optional · bar = one · fork = many</p>
            </div>
          )}
        </Panel>
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
