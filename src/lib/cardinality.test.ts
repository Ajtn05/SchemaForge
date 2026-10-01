import { describe, expect, it } from "vitest";
import {
  relationshipEndpoints,
  cardinalityLabel,
  attributeLabel,
} from "./cardinality";
import { attribute, emptySchema, sampleSchema } from "../domain/sample";
import { toRelational } from "./transform";
import { validateSchema } from "./validation";
import { generateSQL } from "./sql";
import type { Cardinality, Relationship } from "../domain/types";
const relationship = (changes: Partial<Relationship> = {}): Relationship => ({
  id: "r",
  name: "has",
  sourceId: "person",
  targetId: "passport",
  cardinality: "1:1",
  sourceParticipation: "optional",
  targetParticipation: "mandatory",
  attributes: [],
  ...changes,
});
describe("crow's foot relationship semantics", () => {
  for (const cardinality of ["1:1", "1:N", "M:N"] as Cardinality[]) {
    for (const sourceParticipation of ["optional", "mandatory"] as const) {
      for (const targetParticipation of ["optional", "mandatory"] as const) {
        it(`${cardinality} with ${sourceParticipation} source and ${targetParticipation} target reads the opposite endpoint`, () => {
          const ends = relationshipEndpoints(
            relationship({
              cardinality,
              sourceParticipation,
              targetParticipation,
            }),
          );
          expect(ends.source).toEqual({
            minimum: targetParticipation === "mandatory" ? 1 : 0,
            maximum: cardinality === "M:N" ? "many" : 1,
          });
          expect(ends.target).toEqual({
            minimum: sourceParticipation === "mandatory" ? 1 : 0,
            maximum: cardinality === "1:1" ? 1 : "many",
          });
        });
      }
    }
  }
  it("agrees with generated FK nullability in the university example", () => {
    const s = sampleSchema(),
      r = s.relationships.find((r) => r.id === "belongs_to")!;
    const ends = relationshipEndpoints(r);
    expect(cardinalityLabel(ends.source)).toBe("exactly one");
    expect(cardinalityLabel(ends.target)).toBe("zero or many");
    expect(
      toRelational(s)
        .tables.find((t) => t.id === "students")
        ?.columns.find((c) => c.references?.table === "programs")?.nullable,
    ).toBe(false);
    r.targetParticipation = "optional";
    expect(cardinalityLabel(relationshipEndpoints(r).source)).toBe(
      "zero or one",
    );
    expect(
      toRelational(s)
        .tables.find((t) => t.id === "students")
        ?.columns.find((c) => c.references?.table === "programs")?.nullable,
    ).toBe(true);
  });
  it("reads the guide's optional person and mandatory passport example", () => {
    const ends = relationshipEndpoints(relationship());
    expect(cardinalityLabel(ends.target)).toBe("zero or one");
    expect(cardinalityLabel(ends.source)).toBe("exactly one");
  });
  it("uses the guide's braces and brackets for conceptual attributes", () => {
    expect(
      attributeLabel(
        attribute("Phone_Number", "VARCHAR", { multivalued: true }),
      ),
    ).toBe("{Phone_Number}");
    expect(attributeLabel(attribute("Age", "INT", { derived: true }))).toBe(
      "[Age]",
    );
    expect(attributeLabel(attribute("Name"))).toBe("Name");
  });
});
describe("association identity from relationship attributes", () => {
  it("includes semester in the M:N composite key for repeated enrollments", () => {
    const s = sampleSchema();
    const r = s.relationships.find((r) => r.cardinality === "M:N")!;
    r.attributes.push(
      attribute("semester", "VARCHAR", {
        primaryKey: true,
        nullable: true,
        length: 20,
      }),
    );
    const t = toRelational(s).tables.find((t) => t.id === r.id)!;
    expect(t.columns.filter((c) => c.primaryKey).map((c) => c.name)).toEqual([
      "student_id",
      "course_id",
      "semester",
    ]);
    expect(t.columns.find((c) => c.name === "semester")?.nullable).toBe(false);
    expect(t.foreignKeys).toHaveLength(2);
    expect(validateSchema(s).filter((i) => i.severity === "error")).toEqual([]);
    expect(generateSQL(toRelational(s), "mysql")).toContain(
      "PRIMARY KEY (`student_id`, `course_id`, `semester`)",
    );
    expect(generateSQL(toRelational(s), "postgresql")).toContain(
      'PRIMARY KEY ("student_id", "course_id", "semester")',
    );
  });
  it("does not make regular relationship attributes part of the key", () => {
    const s = sampleSchema(),
      t = toRelational(s).tables.find((t) => t.kind === "associative")!;
    expect(t.columns.find((c) => c.name === "enrolled_on")?.primaryKey).toBe(
      false,
    );
  });
  it("flags unsupported relationship key and generated identity combinations", () => {
    const s = {
      ...emptySchema(),
      entities: sampleSchema().entities,
      relationships: [
        relationship({
          sourceId: "programs",
          targetId: "students",
          cardinality: "1:N",
          attributes: [
            attribute("attempt", "INT", {
              primaryKey: true,
              autoIncrement: true,
            }),
          ],
        }),
      ],
    };
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Relationship key needs an associative table",
    );
    expect(validateSchema(s).map((i) => i.title)).toContain(
      "Relationship attribute cannot generate identity",
    );
  });
});
