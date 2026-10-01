import { describe, expect, it } from "vitest";
import { sampleSchema } from "../domain/sample";
import { associativeTableNodes } from "./diagram";
import { relationshipEndpoints } from "./cardinality";
import { isSchema } from "./persistence";
import { toRelational } from "./transform";

describe("associative tables in the diagram", () => {
  it("uses the generated table and resolves M:N into two one-to-many connections", () => {
    const schema = sampleSchema();
    const before = structuredClone(schema);
    const relational = toRelational(schema);
    const nodes = associativeTableNodes(schema, relational);
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node.table).toBe(relational.tables.find((t) => t.kind === "associative"));
    expect(node.table.columns.filter((c) => c.primaryKey && c.references)).toHaveLength(2);
    expect(node.table.columns.some((c) => c.name === "enrolled_on")).toBe(true);
    expect(node.connections.map((c) => c.source)).toEqual(["students", "courses"]);
    for (const connection of node.connections) {
      expect(connection.target).toBe(node.id);
      expect(connection.relationship.id).toBe("enrollment");
      expect(relationshipEndpoints(connection.relationship)).toEqual({
        source: { minimum: 1, maximum: 1 },
        target: { minimum: 0, maximum: "many" },
      });
    }
    expect(schema).toEqual(before);
  });
  it("preserves each participant's minimum without making junction references optional", () => {
    const schema = sampleSchema();
    schema.relationships[0].sourceParticipation = "mandatory";
    const [node] = associativeTableNodes(schema, toRelational(schema));
    expect(relationshipEndpoints(node.connections[0].relationship).target.minimum).toBe(1);
    expect(relationshipEndpoints(node.connections[1].relationship).target.minimum).toBe(0);
    expect(node.connections.every((c) => relationshipEndpoints(c.relationship).source.minimum === 1)).toBe(true);
  });
  it("removes the generated node when the relationship changes to 1:N", () => {
    const schema = sampleSchema();
    schema.relationships[0].cardinality = "1:N";
    expect(associativeTableNodes(schema, toRelational(schema))).toEqual([]);
  });
  it("handles self-associations with distinct references and connection ports", () => {
    const schema = sampleSchema();
    schema.relationships[0].targetId = "students";
    const [node] = associativeTableNodes(schema, toRelational(schema));
    expect(node.connections.map((c) => c.source)).toEqual(["students", "students"]);
    expect(new Set(node.connections.map((c) => c.id)).size).toBe(2);
    expect(new Set(node.connections.map((c) => c.sourceHandle)).size).toBe(2);
    expect(new Set(node.table.columns.filter((c) => c.references).map((c) => c.name)).size).toBe(2);
  });
  it("keeps saved positions and avoids overlapping automatic table placements", () => {
    const schema = sampleSchema();
    schema.relationships.push({ ...schema.relationships[0], id: "other", name: "other" });
    const relational = toRelational(schema);
    const [first, second] = associativeTableNodes(schema, relational);
    expect(first.position).not.toEqual(second.position);
    schema.relationships[0].associativePosition = { x: 940, y: 700 };
    expect(associativeTableNodes(schema, relational)[0].position).toEqual({ x: 940, y: 700 });
    expect(isSchema(schema)).toBe(true);
    schema.relationships[0].associativePosition = { x: NaN, y: 700 };
    expect(isSchema(schema)).toBe(false);
  });
  it("does not collide with an entity ID or create orphaned associative tables", () => {
    const schema = sampleSchema();
    schema.entities[2].id = "associative-enrollment";
    const [node] = associativeTableNodes(schema, toRelational(schema));
    expect(schema.entities.some((e) => e.id === node.id)).toBe(false);
    schema.entities = schema.entities.filter((e) => e.id !== "students");
    expect(associativeTableNodes(schema, toRelational(schema))).toEqual([]);
  });
});
