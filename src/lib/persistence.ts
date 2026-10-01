import type { ConceptualSchema } from "../domain/types";
import { DATA_TYPES } from "../domain/types";
export const STORAGE_KEY = "schemaforge.project.v1";
export function isSchema(input: unknown): input is ConceptualSchema {
  if (!input || typeof input !== "object") return false;
  const s = input as ConceptualSchema;
  const isAttribute = (
    a: ConceptualSchema["entities"][number]["attributes"][number],
  ) =>
    a &&
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    DATA_TYPES.includes(a.type) &&
    [
      "primaryKey",
      "unique",
      "nullable",
      "autoIncrement",
      "multivalued",
      "derived",
      "storeDerived",
    ].every((k) => typeof a[k as keyof typeof a] === "boolean") &&
    ["length", "precision", "scale"].every(
      (k) =>
        a[k as keyof typeof a] === undefined ||
        typeof a[k as keyof typeof a] === "number",
    ) &&
    (a.defaultValue === undefined || typeof a.defaultValue === "string");
  if (
    s.version !== 1 ||
    (s.engine !== undefined &&
      !["none", "mysql", "postgresql"].includes(s.engine)) ||
    typeof s.name !== "string" ||
    typeof s.description !== "string" ||
    !Array.isArray(s.entities) ||
    !Array.isArray(s.relationships)
  )
    return false;
  if (
    !s.entities.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.description === "string" &&
        typeof e.color === "string" &&
        e.position &&
        Number.isFinite(e.position.x) &&
        Number.isFinite(e.position.y) &&
        Array.isArray(e.attributes) &&
        e.attributes.every(isAttribute),
    )
  )
    return false;
  const ids = s.entities.map((e) => e.id);
  if (new Set(ids).size !== ids.length) return false;
  for (const e of s.entities)
    if (new Set(e.attributes.map((a) => a.id)).size !== e.attributes.length)
      return false;
  if (
    s.specializations !== undefined &&
    (!Array.isArray(s.specializations) ||
      !s.specializations.every(
        (g) =>
          g &&
          typeof g.id === "string" &&
          typeof g.supertypeId === "string" &&
          Array.isArray(g.subtypeIds) &&
          g.subtypeIds.every((id) => typeof id === "string") &&
          ["disjoint", "overlapping"].includes(g.exclusivity) &&
          ["total", "partial"].includes(g.completeness),
      ) ||
      new Set(s.specializations.map((g) => g.id)).size !==
        s.specializations.length)
  )
    return false;
  if (
    s.functionalDependencies !== undefined &&
    (!Array.isArray(s.functionalDependencies) ||
      !s.functionalDependencies.every(
        (d) =>
          d &&
          typeof d.id === "string" &&
          typeof d.tableId === "string" &&
          Array.isArray(d.determinantIds) &&
          d.determinantIds.length > 0 &&
          d.determinantIds.every((id) => typeof id === "string") &&
          Array.isArray(d.dependentIds) &&
          d.dependentIds.length > 0 &&
          d.dependentIds.every((id) => typeof id === "string"),
      ) ||
      new Set(s.functionalDependencies.map((d) => d.id)).size !==
        s.functionalDependencies.length)
  )
    return false;
  const relIds = s.relationships.map((r) => r?.id);
  if (new Set(relIds).size !== relIds.length) return false;
  return s.relationships.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      typeof r.name === "string" &&
      typeof r.sourceId === "string" &&
      typeof r.targetId === "string" &&
      ["1:1", "1:N", "M:N"].includes(r.cardinality) &&
      ["optional", "mandatory"].includes(r.sourceParticipation) &&
      ["optional", "mandatory"].includes(r.targetParticipation) &&
      (r.fkSide === undefined || ["source", "target"].includes(r.fkSide)) &&
      [r.sourceHandle, r.targetHandle].every(
        (h) =>
          h === undefined || ["left", "right", "top", "bottom"].includes(h),
      ) &&
      Array.isArray(r.attributes) &&
      r.attributes.every(isAttribute),
  );
}
export function loadProject(): ConceptualSchema | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const schema: unknown = JSON.parse(raw);
      if (isSchema(schema)) return schema;
    }
  } catch {
    /* An unavailable or corrupt local store falls back to a starter project. */
  }
}
export function saveProject(schema: ConceptualSchema): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
    return true;
  } catch {
    return false;
  }
}
export function downloadFile(
  content: string,
  name: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
