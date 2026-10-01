import { describe, expect, it } from "vitest";
import type { ConceptualSchema, Entity, Relationship } from "./types";
import { attribute, emptySchema, sampleSchema } from "./sample";
import { toRelational, foreignKeySide } from "../lib/transform";
import { generateMySQL, orderedTables } from "../lib/mysql";
import { validateSchema } from "../lib/validation";
import { isSchema } from "../lib/persistence";
const entity = (id: string, extra: Entity["attributes"] = []): Entity => ({
  id,
  name: id,
  description: "",
  color: "orange",
  position: { x: 0, y: 0 },
  attributes: [
    attribute(`${id}_id`, "INT", { primaryKey: true, autoIncrement: true }),
    ...extra,
  ],
});
const relationship = (extra: Partial<Relationship> = {}): Relationship => ({
  id: "link",
  name: "enrollment",
  sourceId: "parent",
  targetId: "child",
  cardinality: "1:N",
  sourceParticipation: "optional",
  targetParticipation: "mandatory",
  attributes: [],
  ...extra,
});
const model = (rel: Partial<Relationship> = {}): ConceptualSchema => ({
  ...emptySchema(),
  name: "Test project",
  entities: [entity("parent"), entity("child")],
  relationships: [relationship(rel)],
});
describe("conceptual → relational transformations", () => {
  it("places a 1:N foreign key on the N side without changing the conceptual model", () => {
    const s = model(),
      before = structuredClone(s),
      r = toRelational(s);
    expect(
      r.tables[1].columns.find((c) => c.name === "parent_id"),
    ).toMatchObject({
      primaryKey: false,
      autoIncrement: false,
      nullable: false,
      generated: true,
      references: { table: "parent", column: "parent_id" },
    });
    expect(r.tables[1].foreignKeys[0]).toMatchObject({
      columns: ["parent_id"],
      referencedTable: "parent",
      referencedColumns: ["parent_id"],
    });
    expect(s).toEqual(before);
  });
  it("preserves optional target participation with a nullable foreign key", () => {
    expect(
      toRelational(
        model({ targetParticipation: "optional" }),
      ).tables[1].columns.find((c) => c.generated)?.nullable,
    ).toBe(true);
  });
  it("converts M:N to a composite associative table with relationship attributes", () => {
    const s = model({
      cardinality: "M:N",
      attributes: [attribute("grade", "DECIMAL")],
    });
    const t = toRelational(s).tables[2];
    expect(t.name).toBe("enrollment");
    expect(t.kind).toBe("associative");
    expect(t.columns.filter((c) => c.primaryKey).map((c) => c.name)).toEqual([
      "parent_id",
      "child_id",
    ]);
    expect(t.foreignKeys).toHaveLength(2);
    expect(t.columns.find((c) => c.name === "grade")?.type).toBe("DECIMAL");
    expect(t.columns.filter((c) => c.autoIncrement)).toHaveLength(0);
  });
  it("infers 1:1 placement from mandatory participation and creates uniqueness", () => {
    const s = model({
      cardinality: "1:1",
      sourceParticipation: "mandatory",
      targetParticipation: "optional",
    });
    expect(foreignKeySide(s.relationships[0])).toBe("source");
    expect(toRelational(s).tables[0].uniqueGroups).toEqual([["child_id"]]);
    expect(
      toRelational(s).tables[0].columns.find((c) => c.generated)?.nullable,
    ).toBe(false);
  });
  it("honors an explicit 1:1 FK side", () => {
    const s = model({
      cardinality: "1:1",
      fkSide: "target",
      sourceParticipation: "optional",
      targetParticipation: "optional",
    });
    const t = toRelational(s).tables[1];
    expect(t.uniqueGroups).toEqual([["parent_id"]]);
    expect(t.columns.find((c) => c.generated)?.nullable).toBe(true);
  });
  it("does not silently resolve ambiguous 1:1 placement", () => {
    const s = model({ cardinality: "1:1", targetParticipation: "optional" });
    expect(toRelational(s).tables.flatMap((t) => t.foreignKeys)).toHaveLength(
      0,
    );
    expect(
      validateSchema(s).some((i) => i.title === "Choose foreign key placement"),
    ).toBe(true);
  });
  it("turns a multivalued attribute into a relation with PK/FK and a value key", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("phones", "VARCHAR", { multivalued: true, length: 30 }),
    );
    const r = toRelational(s);
    expect(r.tables[0].columns.some((c) => c.name === "phones")).toBe(false);
    const t = r.tables.find((t) => t.kind === "multivalued")!;
    expect(t.name).toBe("parent_phones");
    expect(t.columns.map((c) => c.primaryKey)).toEqual([true, true]);
    expect(t.columns.find((c) => c.name === "phones")?.nullable).toBe(false);
    expect(t.foreignKeys[0].referencedTable).toBe("parent");
  });
  it("excludes derived values unless explicitly stored", () => {
    const s = model();
    s.entities[0].attributes.push(attribute("age", "INT", { derived: true }));
    expect(
      toRelational(s).tables[0].columns.some((c) => c.name === "age"),
    ).toBe(false);
    s.entities[0].attributes.at(-1)!.storeDerived = true;
    expect(
      toRelational(s).tables[0].columns.some((c) => c.name === "age"),
    ).toBe(true);
  });
  it("copies every component of a composite primary key into a single FK constraint", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("tenant_id", "BIGINT", { primaryKey: true }),
    );
    const t = toRelational(s).tables[1];
    expect(t.foreignKeys[0].columns).toEqual(["parent_id", "tenant_id"]);
    expect(t.foreignKeys[0].referencedColumns).toEqual([
      "parent_id",
      "tenant_id",
    ]);
    expect(t.columns.find((c) => c.name === "tenant_id")?.type).toBe("BIGINT");
  });
  it("makes a composite unique constraint for a composite 1:1 reference", () => {
    const s = model({ cardinality: "1:1" });
    s.entities[0].attributes.push(
      attribute("tenant_id", "BIGINT", { primaryKey: true }),
    );
    expect(toRelational(s).tables[1].uniqueGroups).toEqual([
      ["parent_id", "tenant_id"],
    ]);
  });
  it("handles self-referential M:N keys without collisions", () => {
    const s = model({
      sourceId: "parent",
      targetId: "parent",
      cardinality: "M:N",
    });
    const t = toRelational(s).tables[2];
    expect(t.columns.map((c) => c.name)).toEqual([
      "parent_id",
      "target_parent_id",
    ]);
    expect(t.foreignKeys.map((f) => f.name)).toHaveLength(
      new Set(t.foreignKeys.map((f) => f.name)).size,
    );
  });
  it("tolerates an incomplete relationship and reports it", () => {
    const s = model({ targetId: "missing" });
    expect(() => toRelational(s)).not.toThrow();
    expect(
      validateSchema(s).some((i) => i.title === "Incomplete relationship"),
    ).toBe(true);
  });
  it("keeps constraint symbols unique after truncating long table names", () => {
    const s = model();
    s.entities[1].name = "t".repeat(64);
    s.relationships.push(relationship({ id: "another_link" }));
    const keys = toRelational(s).tables[1].foreignKeys;
    expect(keys.every((k) => k.name.length <= 64)).toBe(true);
    expect(new Set(keys.map((k) => k.name)).size).toBe(2);
  });
  it("avoids generated column collisions regardless of letter case", () => {
    const s = model();
    s.entities[1].attributes.push(attribute("PARENT_ID", "INT"));
    expect(toRelational(s).tables[1].foreignKeys[0].columns).toEqual([
      "parent_parent_id",
    ]);
    expect(validateSchema(s).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("produces the starter enrollment table and no errors", () => {
    const s = sampleSchema();
    expect(
      toRelational(s).tables.find((t) => t.name === "enrollment")?.kind,
    ).toBe("associative");
    expect(validateSchema(s).filter((i) => i.severity === "error")).toEqual([]);
  });
});
describe("MySQL generation", () => {
  it("orders referenced tables first even when input is reversed", () => {
    const s = model();
    s.entities.reverse();
    const r = toRelational(s);
    expect(orderedTables(r).map((t) => t.name)).toEqual(["parent", "child"]);
    const sql = generateMySQL(r);
    expect(sql.indexOf("CREATE TABLE `parent`")).toBeLessThan(
      sql.indexOf("CREATE TABLE `child`"),
    );
  });
  it("generates composite primary and foreign keys", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("tenant_id", "BIGINT", { primaryKey: true }),
    );
    const sql = generateMySQL(toRelational(s));
    expect(sql).toContain("PRIMARY KEY (`parent_id`, `tenant_id`)");
    expect(sql).toContain("FOREIGN KEY (`parent_id`, `tenant_id`)");
    expect(sql).toContain("REFERENCES `parent` (`parent_id`, `tenant_id`)");
  });
  it("preserves type parameters, required, unique, defaults, and auto-increment", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("email", "VARCHAR", { length: 100, unique: true }),
      attribute("price", "DECIMAL", {
        precision: 12,
        scale: 4,
        defaultValue: "0.00",
      }),
      attribute("active", "BOOLEAN", { defaultValue: "true" }),
      attribute("created", "TIMESTAMP", { defaultValue: "CURRENT_TIMESTAMP" }),
      attribute("label", "VARCHAR", { defaultValue: "O'Reilly" }),
    );
    const sql = generateMySQL(toRelational(s));
    expect(sql).toContain("`parent_id` INT NOT NULL AUTO_INCREMENT");
    expect(sql).toContain("`email` VARCHAR(100) NOT NULL UNIQUE");
    expect(sql).toContain("`price` DECIMAL(12,4) NOT NULL DEFAULT 0.00");
    expect(sql).toContain("DEFAULT TRUE");
    expect(sql).toContain("DEFAULT CURRENT_TIMESTAMP");
    expect(sql).toContain("DEFAULT 'O''Reilly'");
  });
  it("does not add NOT NULL to optional generated foreign keys", () => {
    const sql = generateMySQL(
      toRelational(model({ targetParticipation: "optional" })),
    );
    expect(sql).toContain("`parent_id` INT,");
  });
  it("adds all FK constraints after table creation so cycles are executable", () => {
    const s = model();
    s.relationships.push(
      relationship({ id: "back", sourceId: "child", targetId: "parent" }),
    );
    const sql = generateMySQL(toRelational(s));
    expect(sql.lastIndexOf("CREATE TABLE")).toBeLessThan(
      sql.indexOf("ALTER TABLE"),
    );
    expect(
      validateSchema(s).some((i) => i.title === "Circular table dependency"),
    ).toBe(true);
  });
  it("puts auto-increment first in the composite primary-key index", () => {
    const s = model();
    s.entities[0].attributes.unshift(
      attribute("tenant_id", "BIGINT", { primaryKey: true }),
    );
    expect(generateMySQL(toRelational(s))).toContain(
      "PRIMARY KEY (`parent_id`, `tenant_id`)",
    );
  });
  it("uses expression syntax for MySQL TEXT default values", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("notes", "TEXT", { defaultValue: "No notes" }),
    );
    expect(generateMySQL(toRelational(s))).toContain(
      "`notes` TEXT NOT NULL DEFAULT ('No notes')",
    );
  });
  it("is deterministic and does not change relational data", () => {
    const r = toRelational(model()),
      before = structuredClone(r);
    expect(generateMySQL(r)).toBe(generateMySQL(r));
    expect(r).toEqual(before);
  });
  it("safely quotes identifiers and does not permit SQL through defaults", () => {
    const r = toRelational(model());
    r.tables[0].name = "some`table";
    r.tables[0].columns.push({
      ...attribute("label", "VARCHAR", {
        defaultValue: "'); DROP TABLE users; --",
      }),
      generated: false,
    });
    expect(generateMySQL(r)).toContain("`some``table`");
    expect(generateMySQL(r)).toContain("DEFAULT '''); DROP TABLE users; --'");
  });
});
describe("schema validation", () => {
  it("reports duplicate names without case sensitivity", () => {
    const s = model();
    s.entities[1].name = "PARENT";
    s.entities[0].attributes.push(attribute("PARENT_ID"));
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Duplicate entity name",
    );
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Duplicate attribute name",
    );
  });
  it("reports missing primary keys and invalid identifiers", () => {
    const s = model();
    s.entities[0].name = "bad name";
    s.entities[0].attributes[0].primaryKey = false;
    expect(validateSchema(s).map((i) => i.title)).toEqual(
      expect.arrayContaining([
        "Missing primary key",
        "Invalid entity name",
        "Invalid auto-increment column",
      ]),
    );
  });
  it("checks VARCHAR and DECIMAL configuration", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("short", "VARCHAR", { length: 0 }),
      attribute("price", "DECIMAL", { precision: 3, scale: 5 }),
    );
    expect(validateSchema(s).map((i) => i.title)).toEqual(
      expect.arrayContaining([
        "Invalid VARCHAR length",
        "Invalid decimal precision",
      ]),
    );
  });
  it("reports multiple auto-increment columns", () => {
    const s = model();
    s.entities[0].attributes.push(
      attribute("second", "INT", { autoIncrement: true, primaryKey: true }),
    );
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Multiple auto-increment columns",
    );
  });
  it("detects associative table naming collisions", () => {
    const s = model({ cardinality: "M:N", name: "parent" });
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Generated table name collision",
    );
  });
  it("detects unindexed TEXT and oversized primary keys", () => {
    const s = model();
    s.entities[0].attributes = [attribute("id", "TEXT", { primaryKey: true })];
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "TEXT cannot be a complete index",
    );
    s.entities[0].attributes = [
      attribute("id", "VARCHAR", { length: 1000, primaryKey: true }),
    ];
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Primary key exceeds InnoDB limit",
    );
  });
  it("gives educational suggestions for multivalued, derived, and M:N designs", () => {
    const s = model({ cardinality: "M:N" });
    s.entities[0].attributes.push(
      attribute("phones", "VARCHAR", { multivalued: true, length: 20 }),
      attribute("age", "INT", { derived: true }),
    );
    expect(
      validateSchema(s)
        .filter((i) => i.severity === "suggestion")
        .map((i) => i.title),
    ).toEqual(
      expect.arrayContaining([
        "Multivalued attribute",
        "Derived attribute",
        "Associative table generated",
      ]),
    );
  });
  it("checks imports structurally before modifying an existing project", () => {
    expect(isSchema(sampleSchema())).toBe(true);
    expect(isSchema({ version: 1, entities: [], relationships: [] })).toBe(
      false,
    );
    const s = model();
    s.entities[0].attributes[0].nullable = "false" as unknown as boolean;
    expect(isSchema(s)).toBe(false);
  });
});
