import type {
  Attribute,
  ConceptualSchema,
  Entity,
  RelationalColumn,
  RelationalSchema,
  RelationalTable,
  Relationship,
} from "../domain/types";
import { projectEngine } from "./engine";
const column = (a: Attribute, generated = false): RelationalColumn => ({
  ...a,
  nullable: a.primaryKey ? false : a.nullable,
  generated,
});
const persisted = (a: Attribute) =>
  !a.multivalued && (!a.derived || a.storeDerived);
export function foreignKeySide(
  r: Relationship,
): "source" | "target" | undefined {
  if (r.cardinality === "1:N") return "target";
  if (r.fkSide) return r.fkSide;
  if (r.sourceParticipation !== r.targetParticipation)
    return r.sourceParticipation === "mandatory" ? "source" : "target";
  return undefined;
}
function addReference(
  table: RelationalTable,
  parent: Entity,
  prefix: string,
  nullable: boolean,
  primaryKey: boolean,
  relationshipId: string,
) {
  const keys = parent.attributes.filter((a) => a.primaryKey && persisted(a));
  if (!keys.length) return [];
  const names = keys.map((a) => {
    let name = a.name;
    if (table.columns.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      name = `${prefix}_${a.name}`;
    let index = 2;
    const base = name;
    while (
      table.columns.some((c) => c.name.toLowerCase() === name.toLowerCase())
    )
      name = `${base}_${index++}`;
    table.columns.push({
      ...column(a, true),
      id: `${relationshipId}-${prefix}-${a.id}`,
      name,
      primaryKey,
      nullable,
      unique: false,
      autoIncrement: false,
      defaultValue: undefined,
      multivalued: false,
      derived: false,
      references: { table: parent.name, column: a.name },
    });
    return name;
  });
  table.foreignKeys.push({
    name: `fk_${table.name}_${relationshipId.replace(/[^a-zA-Z0-9_]/g, "_")}_${table.foreignKeys.length + 1}`,
    columns: names,
    referencedTable: parent.name,
    referencedColumns: keys.map((a) => a.name),
  });
  return names;
}
export function toRelational(schema: ConceptualSchema): RelationalSchema {
  const tables: RelationalTable[] = [];
  const effective = new Map<string, Entity>();
  const visiting = new Set<string>();
  const resolve = (e: Entity): Entity => {
    if (effective.has(e.id)) return effective.get(e.id)!;
    const group = schema.specializations?.find((g) =>
      g.subtypeIds.includes(e.id),
    );
    const parent = schema.entities.find((p) => p.id === group?.supertypeId);
    const table: RelationalTable = {
      id: e.id,
      name: e.name,
      kind: parent ? "subtype" : "entity",
      sourceId: e.id,
      columns: e.attributes
        .filter(persisted)
        .map((a) =>
          column(
            parent ? { ...a, primaryKey: false, autoIncrement: false } : a,
          ),
        ),
      foreignKeys: [],
      uniqueGroups: [],
    };
    visiting.add(e.id);
    if (parent && group && !visiting.has(parent.id)) {
      const resolvedParent = resolve(parent);
      addReference(table, resolvedParent, parent.name, false, true, group.id);
      table.explanation = `Subtype of ${parent.name}. Its inherited primary key is also a foreign key to the supertype. Shared attributes remain in ${parent.name}; this table stores subtype-specific attributes.`;
    }
    visiting.delete(e.id);
    tables.push(table);
    const resolved = { ...e, attributes: table.columns };
    effective.set(e.id, resolved);
    return resolved;
  };
  schema.entities.forEach(resolve);
  // Preserve conceptual ordering for previews; SQL orders tables by dependency.
  tables.sort(
    (a, b) =>
      schema.entities.findIndex((e) => e.id === a.id) -
      schema.entities.findIndex((e) => e.id === b.id),
  );
  for (const r of schema.relationships) {
    const source = effective.get(r.sourceId),
      target = effective.get(r.targetId);
    if (!source || !target) continue;
    if (r.cardinality === "M:N") {
      const table: RelationalTable = {
        id: r.id,
        name: r.name,
        kind: "associative",
        sourceId: r.id,
        columns: [],
        foreignKeys: [],
        uniqueGroups: [],
        explanation: `The many-to-many relationship between ${source.name} and ${target.name} becomes an associative table. Both foreign keys${r.attributes.some((a) => a.primaryKey && persisted(a)) ? " and the selected relationship key attributes" : ""} form its composite primary key.`,
      };
      addReference(table, source, "source", false, true, r.id);
      addReference(table, target, "target", false, true, r.id);
      table.columns.push(
        ...r.attributes.filter(persisted).map((a) => ({
          ...column(a, true),
          primaryKey: a.primaryKey,
          autoIncrement: false,
        })),
      );
      tables.push(table);
    } else {
      const side = foreignKeySide(r);
      if (!side) continue;
      const receiver = side === "target" ? target : source,
        parent = side === "target" ? source : target;
      const table = tables.find((t) => t.id === receiver.id)!;
      const names = addReference(
        table,
        parent,
        parent.name,
        (side === "target" ? r.targetParticipation : r.sourceParticipation) ===
          "optional",
        false,
        r.id,
      );
      if (r.cardinality === "1:1" && names.length)
        table.uniqueGroups.push(names);
      table.columns.push(
        ...r.attributes.filter(persisted).map((a) => ({
          ...column(a, true),
          primaryKey: false,
          autoIncrement: false,
        })),
      );
    }
  }
  for (const e of schema.entities)
    for (const a of e.attributes.filter(
      (a) => a.multivalued && (!a.derived || a.storeDerived),
    )) {
      const table: RelationalTable = {
        id: `${e.id}-${a.id}`,
        name: `${e.name}_${a.name}`,
        kind: "multivalued",
        sourceId: e.id,
        columns: [],
        foreignKeys: [],
        uniqueGroups: [],
        explanation: `Each value of ${a.name} is stored in its own row, alongside the primary key of ${e.name}. This avoids storing lists in a single column.`,
      };
      addReference(table, effective.get(e.id)!, e.name, false, true, a.id);
      table.columns.push({
        ...column(a, true),
        primaryKey: true,
        nullable: false,
        multivalued: false,
        unique: false,
        autoIncrement: false,
        defaultValue: undefined,
      });
      tables.push(table);
    }
  // Constraint symbols must be unique across the database, even after truncation.
  const usedConstraints = new Set<string>();
  const identifierLimit = projectEngine(schema) === "postgresql" ? 63 : 64;
  for (const table of tables)
    for (const fk of table.foreignKeys) {
      const base = fk.name;
      let name = base.slice(0, identifierLimit),
        index = 2;
      while (usedConstraints.has(name.toLowerCase())) {
        const suffix = `_${index++}`;
        name = base.slice(0, identifierLimit - suffix.length) + suffix;
      }
      fk.name = name;
      usedConstraints.add(name.toLowerCase());
    }
  const enforcementNotes = (schema.specializations ?? []).flatMap((g) => {
    const parent =
      schema.entities.find((e) => e.id === g.supertypeId)?.name ??
      g.supertypeId;
    const notes: string[] = [];
    if (g.exclusivity === "disjoint")
      notes.push(
        `${parent}: disjoint subtypes require application or transactional trigger enforcement; the same parent key must not occur in more than one subtype table.`,
      );
    if (g.completeness === "total")
      notes.push(
        `${parent}: total specialization requires application enforcement; every supertype row must occur in at least one subtype table.`,
      );
    return notes;
  });
  return { tables, enforcementNotes };
}
