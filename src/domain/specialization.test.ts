import { describe, it, expect } from "vitest";
import { attribute, emptySchema } from "./sample";
import type { ConceptualSchema, Entity } from "./types";
import { toRelational } from "../lib/transform";
import { validateSchema } from "../lib/validation";
import { generateMySQL } from "../lib/mysql";
import { isSchema } from "../lib/persistence";
const entity = (id: string, attributes: Entity["attributes"]): Entity => ({
  id,
  name: id,
  description: "",
  color: "orange",
  position: { x: 0, y: 0 },
  attributes,
});
const hierarchy = (): ConceptualSchema => ({
  ...emptySchema(),
  entities: [
    entity("person", [
      attribute("person_id", "BIGINT", {
        id: "pk",
        primaryKey: true,
        autoIncrement: true,
      }),
      attribute("name", "VARCHAR"),
    ]),
    entity("student", [attribute("grade", "INT")]),
    entity("instructor", [attribute("salary", "DECIMAL")]),
  ],
  specializations: [
    {
      id: "isa",
      supertypeId: "person",
      subtypeIds: ["student", "instructor"],
      exclusivity: "disjoint",
      completeness: "total",
    },
  ],
});
describe("specializations", () => {
  it("maps each subtype to a shared PK/FK without duplicating parent attributes", () => {
    const s = hierarchy(),
      before = structuredClone(s),
      r = toRelational(s);
    const student = r.tables[1];
    expect(student.kind).toBe("subtype");
    expect(student.columns.find((c) => c.primaryKey)).toMatchObject({
      name: "person_id",
      type: "BIGINT",
      autoIncrement: false,
      nullable: false,
      generated: true,
    });
    expect(student.columns.some((c) => c.name === "name")).toBe(false);
    expect(student.foreignKeys[0]).toMatchObject({
      columns: ["person_id"],
      referencedTable: "person",
      referencedColumns: ["person_id"],
    });
    expect(s).toEqual(before);
    expect(validateSchema(s).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("supports nested inheritance", () => {
    const s = hierarchy();
    s.entities.push(entity("graduate", [attribute("thesis", "VARCHAR")]));
    s.specializations!.push({
      id: "graduate-isa",
      supertypeId: "student",
      subtypeIds: ["graduate"],
      exclusivity: "overlapping",
      completeness: "partial",
    });
    const t = toRelational(s).tables[3];
    expect(t.columns.find((c) => c.primaryKey)?.name).toBe("person_id");
    expect(t.foreignKeys[0].referencedTable).toBe("student");
    expect(validateSchema(s).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("inherits composite keys and preserves collision-safe references", () => {
    const s = hierarchy();
    s.entities[0].attributes[0].autoIncrement = false;
    s.entities[0].attributes.push(
      attribute("tenant", "INT", { primaryKey: true }),
    );
    s.entities[1].attributes.push(attribute("person_id", "VARCHAR"));
    const t = toRelational(s).tables[1];
    expect(t.columns.filter((c) => c.primaryKey).map((c) => c.name)).toEqual([
      "person_person_id",
      "tenant",
    ]);
    expect(t.foreignKeys[0].referencedColumns).toEqual(["person_id", "tenant"]);
  });
  it("uses inherited keys for ordinary relationships and multivalued tables", () => {
    const s = hierarchy();
    s.entities[1].attributes.push(
      attribute("phones", "VARCHAR", { multivalued: true }),
    );
    s.relationships.push({
      id: "mentors",
      name: "mentors",
      sourceId: "student",
      targetId: "instructor",
      cardinality: "M:N",
      sourceParticipation: "optional",
      targetParticipation: "optional",
      attributes: [],
    });
    const r = toRelational(s);
    expect(
      r.tables
        .find((t) => t.kind === "associative")
        ?.foreignKeys.map((fk) => fk.referencedColumns),
    ).toEqual([["person_id"], ["person_id"]]);
    expect(
      r.tables.find((t) => t.kind === "multivalued")?.foreignKeys[0]
        .referencedColumns,
    ).toEqual(["person_id"]);
  });
  it("reports disjoint and total enforcement gaps in validation and SQL", () => {
    const s = hierarchy(),
      sql = generateMySQL(toRelational(s));
    expect(
      validateSchema(s).filter((i) => i.title.includes("needs enforcement")),
    ).toHaveLength(2);
    expect(sql).toContain("disjoint subtypes require application");
    expect(sql).toContain("total specialization requires application");
    expect(sql).toContain("REFERENCES `person` (`person_id`)");
    expect(sql.indexOf("CREATE TABLE `person`")).toBeLessThan(
      sql.indexOf("CREATE TABLE `student`"),
    );
  });
  it("allows overlapping partial membership without enforcement warnings", () => {
    const s = hierarchy();
    Object.assign(s.specializations![0], {
      exclusivity: "overlapping",
      completeness: "partial",
    });
    expect(toRelational(s).enforcementNotes).toEqual([]);
    expect(validateSchema(s).filter((i) => i.severity === "warning")).toEqual(
      [],
    );
  });
  it("rejects cycles and multiple parents without crashing transformation", () => {
    const s = hierarchy();
    s.specializations!.push({
      id: "cycle",
      supertypeId: "student",
      subtypeIds: ["person", "instructor"],
      exclusivity: "disjoint",
      completeness: "partial",
    });
    const titles = validateSchema(s).map((i) => i.title);
    expect(titles).toContain("Cyclic subtype hierarchy");
    expect(titles).toContain("Multiple supertypes");
    expect(() => toRelational(s)).not.toThrow();
  });
  it("rejects missing entities, empty groups, and local subtype keys", () => {
    const s = hierarchy();
    s.entities[1].attributes[0].primaryKey = true;
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Subtype identity is inherited",
    );
    s.specializations![0].subtypeIds = ["missing"];
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Incomplete specialization",
    );
    s.specializations![0].subtypeIds = [];
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Incomplete specialization",
    );
  });
  it("imports old projects and validates new metadata shape", () => {
    expect(isSchema(emptySchema())).toBe(true);
    expect(isSchema(hierarchy())).toBe(true);
    const s = hierarchy();
    s.functionalDependencies = [
      {
        id: "fd",
        tableId: "person",
        determinantIds: ["pk"],
        dependentIds: ["name"],
      },
    ];
    expect(isSchema(s)).toBe(true);
    expect(
      isSchema({
        ...s,
        specializations: [{ ...s.specializations![0], exclusivity: "invalid" }],
      }),
    ).toBe(false);
    expect(
      isSchema({
        ...s,
        functionalDependencies: [
          { ...s.functionalDependencies[0], determinantIds: [] },
        ],
      }),
    ).toBe(false);
    expect(isSchema({ ...s, functionalDependencies: "invalid" })).toBe(false);
  });
});
