import { describe, expect, it } from "vitest";
import type { FunctionalDependency, RelationalTable } from "../domain/types";
import { attribute } from "../domain/sample";
import { analyzeNormalization, attributeClosure } from "./normalization";
const table = (names: string[], pk: string[] = []): RelationalTable => ({
  id: "test",
  name: "test",
  sourceId: "test",
  kind: "entity",
  columns: names.map((name) => ({
    ...attribute(name, "INT", { id: name, primaryKey: pk.includes(name) }),
    generated: false,
  })),
  foreignKeys: [],
  uniqueGroups: [],
});
const fd = (
  left: string[],
  right: string[],
  id = "fd",
): FunctionalDependency => ({
  id,
  tableId: "test",
  determinantIds: left,
  dependentIds: right,
});
describe("normalization from constraints and declared dependencies", () => {
  it("computes closure to a fixed point", () => {
    expect([
      ...attributeClosure(["a"], [fd(["b"], ["c"]), fd(["a"], ["b"])]),
    ]).toEqual(["a", "b", "c"]);
  });
  it("reports a partial dependency on a composite key", () => {
    const r = analyzeNormalization(
      table(
        ["student", "course", "student_name", "grade"],
        ["student", "course"],
      ),
      [fd(["student"], ["student_name"])],
    );
    expect(r.candidateKeys).toEqual([["student", "course"]]);
    expect(r.findings.map((f) => f.form)).toEqual(
      expect.arrayContaining(["2NF", "3NF", "BCNF"]),
    );
    expect(r.findings.find((f) => f.form === "2NF")?.dependent).toEqual([
      "student_name",
    ]);
  });
  it("identifies transitive non-key dependencies while preserving 2NF", () => {
    const r = analyzeNormalization(
      table(["employee", "dept", "dept_name"], ["employee"]),
      [fd(["dept"], ["dept_name"])],
    );
    expect(r.findings.some((f) => f.form === "2NF")).toBe(false);
    expect(r.findings.map((f) => f.form)).toEqual(["BCNF", "3NF"]);
  });
  it("distinguishes 3NF from BCNF using alternate candidate keys", () => {
    const r = analyzeNormalization(
      table(["student", "course", "instructor"], ["student", "course"]),
      [fd(["instructor"], ["course"])],
    );
    expect(r.candidateKeys).toEqual([
      ["student", "course"],
      ["student", "instructor"],
    ]);
    expect(r.findings.map((f) => f.form)).toEqual(["BCNF"]);
  });
  it("discovers business candidate keys in addition to surrogate keys", () => {
    const r = analyzeNormalization(table(["id", "email", "name"], ["id"]), [
      fd(["email"], ["id"]),
    ]);
    expect(r.candidateKeys).toEqual([["id"], ["email"]]);
    expect(r.findings).toEqual([]);
  });
  it("recognizes non-null unique constraints but excludes nullable UNIQUE", () => {
    const t = table(["id", "email", "nickname"], ["id"]);
    Object.assign(t.columns[1], { unique: true, nullable: false });
    Object.assign(t.columns[2], { unique: true, nullable: true });
    expect(analyzeNormalization(t).candidateKeys).toEqual([["id"], ["email"]]);
  });
  it("recognizes composite unique constraints as alternate keys", () => {
    const t = table(["id", "tenant", "code"], ["id"]);
    t.uniqueGroups.push(["tenant", "code"]);
    expect(analyzeNormalization(t).candidateKeys).toEqual([
      ["id"],
      ["tenant", "code"],
    ]);
  });
  it("does not treat foreign keys as candidate keys", () => {
    const t = table(["id", "parent_id", "label"], ["id"]);
    t.columns[1].references = { table: "parent", column: "id" };
    expect(analyzeNormalization(t).candidateKeys).toEqual([["id"]]);
  });
  it("ignores trivial and superkey dependencies", () => {
    expect(
      analyzeNormalization(table(["id", "value"], ["id"]), [
        fd(["value"], ["value"]),
        fd(["id", "value"], ["value"], "fd2"),
      ]).findings,
    ).toEqual([]);
  });
  it("retains stable rules across column renames and flags removed columns", () => {
    const t = table(["id", "dept", "label"], ["id"]),
      d = fd(["dept"], ["label"]);
    t.columns[1].name = "department";
    expect(analyzeNormalization(t, [d]).findings[0].message).toContain(
      "department",
    );
    t.columns.pop();
    expect(analyzeNormalization(t, [d]).invalidDependencyIds).toEqual(["fd"]);
  });
  it("handles transitive closure and indirect partial dependencies", () => {
    const r = analyzeNormalization(table(["a", "b", "c", "d"], ["a", "b"]), [
      fd(["a"], ["c"]),
      fd(["c"], ["d"], "fd2"),
    ]);
    expect(r.findings.find((f) => f.form === "2NF")?.dependent).toEqual([
      "c",
      "d",
    ]);
  });
  it("bounds key searches and does not assert 2NF/3NF with missing alternate keys", () => {
    const names = Array.from({ length: 15 }, (_, i) => `c${i}`);
    const t = table([...names, "value"], names);
    const r = analyzeNormalization(
      t,
      names.map((name, i) => fd([name], ["value"], `fd${i}`)),
    );
    expect(r.incomplete).toBe(true);
    expect(r.findings.every((f) => f.form === "BCNF")).toBe(true);
  });
  it("uses the complete row as a candidate key when no narrower key is known", () => {
    expect(analyzeNormalization(table(["a", "b"])).candidateKeys).toEqual([
      ["a", "b"],
    ]);
  });
});
