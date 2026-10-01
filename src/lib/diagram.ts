import type {
  ConceptualSchema,
  Entity,
  Relationship,
  RelationalSchema,
  RelationalTable,
} from "../domain/types";

type Bounds = Entity["position"] & {
  width: number;
  height: number;
};
export interface AssociativeTableNode {
  id: string;
  relationship: Relationship;
  table: RelationalTable;
  position: Entity["position"];
  connections: {
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
    relationship: Relationship;
    sourceName: string;
    targetName: string;
  }[];
}
const width = 265;
const height = (rows: number) => 110 + rows * 30;
const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width + 40 &&
  a.x + a.width + 40 > b.x &&
  a.y < b.y + b.height + 40 &&
  a.y + a.height + 40 > b.y;

// Generated nodes remain views of relationships; they never become duplicate entities.
export function associativeTableNodes(
  schema: ConceptualSchema,
  relational: RelationalSchema,
): AssociativeTableNode[] {
  const bounds: Bounds[] = schema.entities.map((e) => ({
    ...e.position,
    width,
    height: height(Math.max(
      e.attributes.length,
      relational.tables.find((t) => t.id === e.id)?.columns.length ?? 0,
    )),
  }));
  const tables = relational.tables.filter((t) => t.kind === "associative");
  // Reserve moved tables first so automatic placement respects the user's layout.
  for (const t of tables) {
    const p = schema.relationships.find(
      (r) => r.id === t.sourceId,
    )?.associativePosition;
    if (p) bounds.push({ ...p, width, height: height(t.columns.length + 1) });
  }
  const ids = new Set(schema.entities.map((e) => e.id));
  return tables.flatMap((table) => {
    const r = schema.relationships.find((r) => r.id === table.sourceId);
    const source = schema.entities.find((e) => e.id === r?.sourceId);
    const target = schema.entities.find((e) => e.id === r?.targetId);
    if (!r || !source || !target) return [];
    let id = `associative-${r.id}`;
    while (ids.has(id)) id = `_${id}`;
    ids.add(id);
    const tableHeight = height(table.columns.length + 1);
    let position = r.associativePosition;
    if (!position) {
      const middle = {
        x: (source.position.x + target.position.x) / 2,
        y: (source.position.y + target.position.y) / 2,
      };
      const candidates = [
        middle,
        {
          x: middle.x,
          y: Math.min(source.position.y, target.position.y) - tableHeight - 80,
        },
        { x: middle.x, y: Math.max(...bounds.map((b) => b.y + b.height)) + 80 },
      ];
      position = candidates.find((p) => !bounds.some((b) =>
        overlaps({ ...p, width, height: tableHeight }, b),
      )) ?? {
        x: Math.max(...bounds.map((b) => b.x + b.width)) + 80,
        y: middle.y,
      };
      bounds.push({ ...position, width, height: tableHeight });
    }
    const connections = ([source, target] as const).map((parent, index) => {
      const dx = position.x - parent.position.x;
      const dy = position.y + tableHeight / 2 - parent.position.y -
        height(parent.attributes.length) / 2;
      const self = source.id === target.id;
      const sourceHandle = self
        ? (index === 0 ? "top" : "right")
        : Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? "right" : "left")
          : (dy > 0 ? "bottom" : "top");
      return {
        id: `${id}-${index}`,
        source: parent.id,
        target: id,
        sourceHandle,
        targetHandle: index === 0 ? "left" : "right",
        sourceName: parent.name,
        targetName: table.name,
        relationship: {
          ...r,
          sourceId: parent.id,
          targetId: id,
          cardinality: "1:N" as const,
          sourceParticipation: index === 0
            ? r.sourceParticipation
            : r.targetParticipation,
          targetParticipation: "mandatory" as const,
        },
      };
    });
    return [{ id, relationship: r, table, position, connections }];
  });
}
