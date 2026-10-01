import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "./useProject";
import { emptySchema, sampleSchema } from "../domain/sample";
import { isSchema, loadProject, STORAGE_KEY } from "../lib/persistence";
import { toRelational } from "../lib/transform";
import { associativeTableNodes } from "../lib/diagram";
const data = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
  removeItem: (key: string) => data.delete(key),
  clear: () => data.clear(),
});
beforeEach(() => {
  data.clear();
  useProject.setState({
    schema: emptySchema(),
    past: [],
    future: [],
    selection: null,
    selectedIds: [],
    historyKey: "",
    historyAt: 0,
  });
});
describe("project editing, history, and persistence", () => {
  it("persists associative table movement as one undoable diagram edit", () => {
    useProject.getState().replaceProject(sampleSchema());
    useProject.getState().checkpoint();
    useProject.getState().moveDiagramNodes([
      { kind: "entity", id: "students", position: { x: 100, y: 80 } },
      { kind: "relationship", id: "enrollment", position: { x: 780, y: 60 } },
    ]);
    expect(loadProject()?.relationships[0].associativePosition).toEqual({ x: 780, y: 60 });
    useProject.getState().undo();
    expect(useProject.getState().schema.entities[0].position).toEqual({ x: 60, y: 45 });
    expect(useProject.getState().schema.relationships[0].associativePosition).toBeUndefined();
    useProject.getState().redo();
    const schema = useProject.getState().schema;
    expect(associativeTableNodes(schema, toRelational(schema))[0].position).toEqual({ x: 780, y: 60 });
  });
  it("updates the diagram topology through relationship edits and undo", () => {
    useProject.getState().replaceProject(sampleSchema());
    useProject.getState().updateRelationship("enrollment", { cardinality: "1:N" });
    let schema = useProject.getState().schema;
    expect(associativeTableNodes(schema, toRelational(schema))).toEqual([]);
    useProject.getState().undo();
    schema = useProject.getState().schema;
    expect(associativeTableNodes(schema, toRelational(schema))).toHaveLength(1);
  });
  it("creates and persists entities and attributes", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().updateEntity(id, { name: "accounts" });
    useProject.getState().addAttribute(id);
    expect(useProject.getState().schema.entities[0].attributes).toHaveLength(2);
    expect(loadProject()?.entities[0].name).toBe("accounts");
    expect(data.get(STORAGE_KEY)).toBeDefined();
  });
  it("supports undo and redo through dependent diagrams and relational results", () => {
    const parent = useProject.getState().addEntity(),
      child = useProject.getState().addEntity();
    useProject.getState().connect(parent, child);
    expect(
      toRelational(useProject.getState().schema).tables[1].foreignKeys,
    ).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().schema.relationships).toHaveLength(0);
    expect(
      toRelational(useProject.getState().schema).tables[1].foreignKeys,
    ).toHaveLength(0);
    useProject.getState().redo();
    expect(useProject.getState().schema.relationships).toHaveLength(1);
    expect(loadProject()?.relationships).toHaveLength(1);
  });
  it("removes connected relationships with an entity and restores them on undo", () => {
    const parent = useProject.getState().addEntity(),
      child = useProject.getState().addEntity();
    useProject.getState().connect(parent, child);
    useProject.getState().select({ kind: "entity", id: parent });
    useProject.getState().removeSelection();
    expect(useProject.getState().schema.entities).toHaveLength(1);
    expect(useProject.getState().schema.relationships).toHaveLength(0);
    useProject.getState().undo();
    expect(useProject.getState().schema.entities).toHaveLength(2);
    expect(useProject.getState().schema.relationships).toHaveLength(1);
  });
  it("deletes a selected attribute without deleting its owning entity", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().addAttribute(id);
    useProject.getState().removeSelection();
    expect(useProject.getState().schema.entities).toHaveLength(1);
    expect(useProject.getState().schema.entities[0].attributes).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().schema.entities[0].attributes).toHaveLength(2);
  });
  it("duplicates multiple entities with fresh attribute IDs and unique names", () => {
    const a = useProject.getState().addEntity(),
      b = useProject.getState().addEntity();
    useProject.getState().select({ kind: "entity", id: a });
    useProject.getState().selectMany([a, b]);
    useProject.getState().duplicate();
    const e = useProject.getState().schema.entities;
    expect(e).toHaveLength(4);
    expect(new Set(e.map((t) => t.name)).size).toBe(4);
    expect(new Set(e.flatMap((t) => t.attributes.map((a) => a.id))).size).toBe(
      4,
    );
  });
  it("keeps the inspector selection in sync when a group is deselected", () => {
    const a = useProject.getState().addEntity();
    const b = useProject.getState().addEntity();
    useProject.getState().select({ kind: "entity", id: a });
    useProject.getState().selectMany([a, b]);
    useProject.getState().selectMany([b]);
    expect(useProject.getState().selection).toEqual({ kind: "entity", id: b });
    useProject.getState().selectMany([]);
    expect(useProject.getState().selection).toBeNull();
  });
  it("does not record selection changes in undo history", () => {
    const id = useProject.getState().addEntity(),
      count = useProject.getState().past.length;
    useProject.getState().select({ kind: "entity", id });
    useProject.getState().select(null);
    expect(useProject.getState().past).toHaveLength(count);
  });
  it("groups sequential field edits into one meaningful undo step", () => {
    const id = useProject.getState().addEntity(),
      original = useProject.getState().schema.entities[0].name;
    useProject.getState().updateEntity(id, { name: "s" });
    useProject.getState().updateEntity(id, { name: "students" });
    useProject.getState().undo();
    expect(useProject.getState().schema.entities[0].name).toBe(original);
  });
  it("clears redo after a new change", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().updateEntity(id, { name: "students" });
    useProject.getState().undo();
    expect(useProject.getState().future).toHaveLength(1);
    useProject.getState().updateEntity(id, { description: "New change" });
    expect(useProject.getState().future).toHaveLength(0);
  });
  it("can undo loading a different project", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().updateEntity(id, { name: "my_table" });
    useProject.getState().replaceProject(sampleSchema());
    expect(useProject.getState().schema.entities).toHaveLength(4);
    useProject.getState().undo();
    expect(useProject.getState().schema.entities[0].name).toBe("my_table");
  });
  it("enforces not-null keys and removes auto increment when a key is cleared", () => {
    const id = useProject.getState().addEntity(),
      a = useProject.getState().schema.entities[0].attributes[0];
    useProject.getState().updateAttribute(id, a.id, { primaryKey: false });
    expect(
      useProject.getState().schema.entities[0].attributes[0].autoIncrement,
    ).toBe(false);
    useProject
      .getState()
      .updateAttribute(id, a.id, { primaryKey: true, nullable: true });
    expect(
      useProject.getState().schema.entities[0].attributes[0].nullable,
    ).toBe(false);
  });
});

describe("hierarchy and normalization project editing", () => {
  it("creates a subtype atomically and persists its hierarchy", () => {
    const parent = useProject.getState().addEntity();
    useProject.getState().addSubtype(parent);
    const s = useProject.getState().schema;
    expect(s.entities).toHaveLength(2);
    expect(s.entities[1].attributes).toEqual([]);
    expect(s.specializations?.[0].subtypeIds).toEqual([s.entities[1].id]);
    expect(toRelational(s).tables[1].columns[0].primaryKey).toBe(true);
    expect(loadProject()?.specializations).toEqual(s.specializations);
    useProject.getState().undo();
    expect(useProject.getState().schema.entities).toHaveLength(1);
    useProject.getState().redo();
    expect(useProject.getState().schema.entities).toHaveLength(2);
  });
  it("assigns and detaches an existing subtype while retaining its attributes", () => {
    const parent = useProject.getState().addEntity(),
      child = useProject.getState().addEntity();
    const original = useProject.getState().schema.entities[1].attributes[0];
    useProject.getState().setSupertype(child, parent);
    expect(
      useProject.getState().schema.entities[1].attributes[0],
    ).toMatchObject({
      id: original.id,
      primaryKey: false,
      autoIncrement: false,
    });
    useProject.getState().setSupertype(child, "");
    expect(useProject.getState().schema.specializations).toEqual([]);
  });
  it("rejects circular reparenting", () => {
    const parent = useProject.getState().addEntity();
    useProject.getState().addSubtype(parent);
    const child = useProject.getState().schema.entities[1].id;
    const before = structuredClone(useProject.getState().schema);
    useProject.getState().setSupertype(parent, child);
    expect(useProject.getState().schema).toEqual(before);
  });
  it("removes and restores hierarchy links with entity deletion", () => {
    const parent = useProject.getState().addEntity();
    useProject.getState().addSubtype(parent);
    useProject.getState().select({ kind: "entity", id: parent });
    useProject.getState().removeSelection();
    expect(useProject.getState().schema.specializations).toEqual([]);
    useProject.getState().undo();
    expect(useProject.getState().schema.specializations).toHaveLength(1);
  });
  it("duplicates a subtype into its existing group", () => {
    const parent = useProject.getState().addEntity();
    useProject.getState().addSubtype(parent);
    useProject.getState().duplicate();
    const s = useProject.getState().schema;
    expect(s.specializations?.[0].subtypeIds).toHaveLength(2);
    expect(toRelational(s).tables[2].columns[0].primaryKey).toBe(true);
  });
  it("duplicates a selected parent and child as a separate hierarchy", () => {
    const parent = useProject.getState().addEntity();
    useProject.getState().addSubtype(parent);
    const child = useProject.getState().schema.entities[1].id;
    useProject.getState().selectMany([parent, child]);
    useProject.getState().duplicate();
    const s = useProject.getState().schema;
    expect(s.specializations).toHaveLength(2);
    expect(s.specializations?.[1].supertypeId).toBe(s.entities[2].id);
    expect(toRelational(s).tables[3].foreignKeys[0].referencedTable).toBe(
      s.entities[2].name,
    );
  });
  it("persists dependency edits and restores them with undo", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().mutate((s) => {
      s.functionalDependencies = [
        { id: "fd", tableId: id, determinantIds: ["a"], dependentIds: ["b"] },
      ];
    });
    expect(loadProject()?.functionalDependencies).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().schema.functionalDependencies).toBeUndefined();
    useProject.getState().redo();
    expect(useProject.getState().schema.functionalDependencies).toHaveLength(1);
  });
  it("does not carry old optional metadata into replacement projects", () => {
    const id = useProject.getState().addEntity();
    useProject.getState().addSubtype(id);
    useProject.getState().mutate((s) => {
      s.relationshipNotation = "crow-foot";
      s.functionalDependencies = [
        { id: "fd", tableId: id, determinantIds: ["a"], dependentIds: ["b"] },
      ];
    });
    useProject.getState().replaceProject(sampleSchema());
    expect(useProject.getState().schema.specializations).toBeUndefined();
    expect(useProject.getState().schema.functionalDependencies).toBeUndefined();
    expect(useProject.getState().schema.relationshipNotation).toBeUndefined();
    useProject.getState().undo();
    expect(useProject.getState().schema.specializations).toHaveLength(1);
    expect(useProject.getState().schema.functionalDependencies).toHaveLength(1);
    expect(loadProject()?.relationshipNotation).toBe("crow-foot");
  });
});

describe("project engine settings", () => {
  it("persists notation independently of the generated schema and restores it with undo", () => {
    useProject.getState().replaceProject(sampleSchema());
    const relational = toRelational(useProject.getState().schema);
    useProject.getState().mutate((s) => { s.relationshipNotation = "crow-foot"; });
    expect(loadProject()?.relationshipNotation).toBe("crow-foot");
    expect(toRelational(useProject.getState().schema)).toEqual(relational);
    useProject.getState().undo();
    expect(loadProject()?.relationshipNotation).toBeUndefined();
    useProject.getState().redo();
    expect(loadProject()?.relationshipNotation).toBe("crow-foot");
    expect(isSchema({ ...sampleSchema(), relationshipNotation: "cardinality" })).toBe(true);
    expect(isSchema({ ...sampleSchema(), relationshipNotation: "invalid" })).toBe(false);
  });
  it("persists settings atomically and restores the engine with undo/redo", () => {
    useProject.getState().mutate((s) => {
      s.name = "Postgres project";
      s.description = "Example";
      s.engine = "postgresql";
    });
    expect(loadProject()).toMatchObject({
      name: "Postgres project",
      description: "Example",
      engine: "postgresql",
    });
    useProject.getState().undo();
    expect(useProject.getState().schema.engine).toBeUndefined();
    useProject.getState().redo();
    expect(loadProject()?.engine).toBe("postgresql");
  });
  it("does not retain a previous engine when importing a legacy project", () => {
    useProject.getState().mutate((s) => {
      s.engine = "none";
    });
    useProject.getState().replaceProject(sampleSchema());
    expect(useProject.getState().schema.engine).toBeUndefined();
  });
});
