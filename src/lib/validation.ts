import type {
  Attribute,
  ConceptualSchema,
  ValidationIssue,
} from "../domain/types";
import { DATA_TYPES } from "../domain/types";
import { foreignKeySide, toRelational } from "./transform";
import { projectEngine, engineLabels } from "./engine";
import { sqlType } from "./mysql";
export function validateSchema(schema: ConceptualSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const engine = projectEngine(schema);
  const identifierLimit =
    engine === "postgresql" ? 63 : engine === "mysql" ? 64 : Infinity;
  const identifierHint =
    engine === "none" ? "" : ` (${identifierLimit} characters maximum)`;
  const precisionLimit = engine === "mysql" ? 65 : 1000;
  const scaleLimit = engine === "mysql" ? 30 : 1000;
  const add = (
    severity: ValidationIssue["severity"],
    title: string,
    message: string,
    context: Partial<ValidationIssue> = {},
  ) =>
    issues.push({
      id: `issue-${issues.length}`,
      severity,
      title,
      message,
      ...context,
    });
  const validName = (name: string) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= identifierLimit;
  function attributes(
    attrs: Attribute[],
    context: Partial<ValidationIssue>,
    requirePK: boolean,
  ) {
    if (
      requirePK &&
      !attrs.some(
        (a) => a.primaryKey && !a.multivalued && (!a.derived || a.storeDerived),
      )
    )
      add(
        "error",
        "Missing primary key",
        "Choose a primary key to uniquely identify each record.",
        context,
      );
    if (engine === "mysql" && attrs.filter((a) => a.autoIncrement).length > 1)
      add(
        "error",
        "Multiple auto-increment columns",
        "MySQL permits one AUTO_INCREMENT column per table.",
        context,
      );
    const seen = new Set<string>();
    for (const a of attrs) {
      const ctx = { ...context, attributeId: a.id };
      if (!validName(a.name))
        add(
          "error",
          "Invalid attribute name",
          `“${a.name}” must start with a letter or underscore and contain only letters, numbers, and underscores ${identifierHint}.`,
          ctx,
        );
      if (seen.has(a.name.toLowerCase()))
        add(
          "error",
          "Duplicate attribute name",
          `“${a.name}” is already used in this entity.`,
          ctx,
        );
      seen.add(a.name.toLowerCase());
      if (!DATA_TYPES.includes(a.type))
        add(
          "error",
          "Unsupported data type",
          `Choose a supported data type for ${a.name}.`,
          ctx,
        );
      if (
        a.type === "VARCHAR" &&
        (!Number.isInteger(a.length ?? 255) ||
          (a.length ?? 255) < 1 ||
          (engine === "mysql" && (a.length ?? 255) > 16383))
      )
        add(
          "error",
          "Invalid VARCHAR length",
          engine === "mysql"
            ? `Set ${a.name} to a length between 1 and 16,383 for utf8mb4.`
            : `Set ${a.name} to a positive whole-number length.`,
          ctx,
        );
      if (
        a.type === "DECIMAL" &&
        (!Number.isInteger(a.precision ?? 10) ||
          !Number.isInteger(a.scale ?? 2) ||
          (a.precision ?? 10) < 1 ||
          (a.precision ?? 10) > precisionLimit ||
          (a.scale ?? 2) < 0 ||
          (a.scale ?? 2) > scaleLimit ||
          (a.scale ?? 2) > (a.precision ?? 10))
      )
        add(
          "error",
          "Invalid decimal precision",
          `Precision must be 1–${precisionLimit}. Scale must be 0–${scaleLimit} and no greater than precision.`,
          ctx,
        );
      if (
        a.autoIncrement &&
        (!["INT", "BIGINT"].includes(a.type) ||
          !a.primaryKey ||
          a.multivalued ||
          a.derived)
      )
        add(
          "error",
          "Invalid auto-increment column",
          "Generated identity requires a stored INT or BIGINT primary key in SchemaForge.",
          ctx,
        );
      if (a.autoIncrement && a.defaultValue)
        add(
          "error",
          "Auto-increment has a default",
          "Remove the default value from an AUTO_INCREMENT attribute.",
          ctx,
        );
      if (a.primaryKey && (a.multivalued || (a.derived && !a.storeDerived)))
        add(
          "error",
          "Primary key is not stored",
          "Use a stored, single-valued attribute as the entity primary key.",
          ctx,
        );
      if (
        engine === "mysql" &&
        (a.primaryKey || a.unique || a.multivalued) &&
        a.type === "TEXT"
      )
        add(
          "error",
          "TEXT cannot be a complete index",
          "Use VARCHAR for indexed or multivalued text. A TEXT key needs a prefix index, which this generator does not create.",
          ctx,
        );
      if (
        a.defaultValue &&
        ["INT", "BIGINT", "DECIMAL", "BOOLEAN"].includes(a.type) &&
        !/^(?:-?\d+(?:\.\d+)?|true|false)$/i.test(a.defaultValue)
      )
        add(
          "error",
          "Invalid numeric default",
          `Use a numeric value${a.type === "BOOLEAN" ? " or TRUE/FALSE" : ""} for ${a.name}.`,
          ctx,
        );
      if (engine === "postgresql" && a.defaultValue) {
        if (
          a.type === "BOOLEAN" &&
          !/^(?:true|false|0|1)$/i.test(a.defaultValue)
        )
          add(
            "error",
            "Invalid boolean default",
            "Use TRUE, FALSE, 0, or 1 for a PostgreSQL boolean default.",
            ctx,
          );
        if (
          ["INT", "BIGINT", "DECIMAL"].includes(a.type) &&
          /^(?:true|false)$/i.test(a.defaultValue)
        )
          add(
            "error",
            "Invalid numeric default",
            "Use a numeric literal for PostgreSQL numeric defaults.",
            ctx,
          );
      }
      if (a.multivalued && (!a.derived || a.storeDerived))
        add(
          "suggestion",
          "Multivalued attribute",
          `${a.name} will become a separate table. Each value gets its own row, avoiding a list stored in one column.`,
          ctx,
        );
      if (a.derived)
        add(
          "suggestion",
          "Derived attribute",
          `${a.name} ${a.storeDerived ? "will be stored because you explicitly enabled storage." : "will be excluded from SQL. Calculate it from stored data when needed."}`,
          ctx,
        );
      else if (a.name.toLowerCase() === "age")
        add(
          "suggestion",
          "Store the date, calculate the age",
          "Age changes over time. Consider storing birth_date and deriving age.",
          ctx,
        );
    }
  }
  const names = new Set<string>();
  for (const e of schema.entities) {
    const ctx = { entityId: e.id };
    if (!validName(e.name))
      add(
        "error",
        "Invalid entity name",
        `“${e.name}” is not a valid identifier. Use letters, numbers, and underscores${identifierHint}.`,
        ctx,
      );
    if (names.has(e.name.toLowerCase()))
      add(
        "error",
        "Duplicate entity name",
        `Another entity is named “${e.name}”.`,
        ctx,
      );
    names.add(e.name.toLowerCase());
    const isSubtype = schema.specializations?.some((g) =>
      g.subtypeIds.includes(e.id),
    );
    attributes(e.attributes, ctx, !isSubtype);
    if (isSubtype && e.attributes.some((a) => a.primaryKey || a.autoIncrement))
      add(
        "error",
        "Subtype identity is inherited",
        "Remove local primary-key and auto-increment flags. A subtype uses its supertype’s key.",
        ctx,
      );
  }
  const parents = new Map<string, string>();
  for (const g of schema.specializations ?? []) {
    const ctx = { specializationId: g.id, entityId: g.supertypeId };
    if (
      !schema.entities.some((e) => e.id === g.supertypeId) ||
      !g.subtypeIds.length ||
      g.subtypeIds.some((id) => !schema.entities.some((e) => e.id === id))
    )
      add(
        "error",
        "Incomplete specialization",
        "Choose an existing supertype and at least one existing subtype.",
        ctx,
      );
    if (new Set(g.subtypeIds).size !== g.subtypeIds.length)
      add(
        "error",
        "Duplicate subtype",
        "Each subtype may appear once in a specialization.",
        ctx,
      );
    for (const id of g.subtypeIds) {
      if (parents.has(id))
        add(
          "error",
          "Multiple supertypes",
          "Each subtype currently supports one direct supertype. Nested hierarchies are supported.",
          { ...ctx, entityId: id },
        );
      parents.set(id, g.supertypeId);
    }
    if (
      (schema.specializations ?? []).filter(
        (other) => other.supertypeId === g.supertypeId,
      ).length > 1
    )
      add(
        "error",
        "Duplicate specialization",
        "Keep one specialization group per supertype.",
        ctx,
      );
    if (g.exclusivity === "disjoint")
      add(
        "warning",
        "Disjointness needs enforcement",
        "Shared-key foreign keys enforce parent membership. Preventing membership in multiple sibling subtypes requires application logic or transactional triggers.",
        ctx,
      );
    if (g.completeness === "total")
      add(
        "warning",
        "Total specialization needs enforcement",
        "Every supertype row must belong to a subtype. Enforce this across table writes in your application.",
        ctx,
      );
  }
  for (const id of parents.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && parents.has(current)) {
      if (seen.has(current)) {
        add(
          "error",
          "Cyclic subtype hierarchy",
          "A subtype cannot be its own ancestor.",
          { entityId: id },
        );
        break;
      }
      seen.add(current);
      current = parents.get(current);
    }
  }
  for (const r of schema.relationships) {
    const ctx = { relationshipId: r.id };
    const source = schema.entities.find((e) => e.id === r.sourceId),
      target = schema.entities.find((e) => e.id === r.targetId);
    if (!source || !target) {
      add(
        "error",
        "Incomplete relationship",
        "Connect both ends to an existing entity.",
        ctx,
      );
      continue;
    }
    attributes(r.attributes, ctx, false);
    if (r.cardinality !== "M:N" && r.attributes.some((a) => a.primaryKey))
      add(
        "error",
        "Relationship key needs an associative table",
        "Relationship primary-key attributes are supported on M:N associations. Clear the key flag or use an M:N relationship.",
        ctx,
      );
    if (r.attributes.some((a) => a.autoIncrement))
      add(
        "error",
        "Relationship attribute cannot generate identity",
        "Relationship attributes cannot use auto increment. Use participant keys and explicit relationship key attributes instead.",
        ctx,
      );
    if (r.cardinality === "M:N") {
      if (!validName(r.name))
        add(
          "error",
          "Invalid associative table name",
          "Use an SQL identifier for the name of a many-to-many relationship.",
          ctx,
        );
      add(
        "suggestion",
        "Associative table generated",
        `The M:N relationship creates “${r.name}” with foreign keys to ${source.name} and ${target.name}. Its primary key combines those references with any selected relationship key attributes. Check whether repeated pairs need a semester, attempt number, or other key component.`,
        ctx,
      );
    }
    if (r.cardinality === "1:1" && !foreignKeySide(r))
      add(
        "error",
        "Choose foreign key placement",
        "Both entities have the same participation. Choose which entity stores the unique foreign key in the relationship inspector.",
        ctx,
      );
    else if (
      r.cardinality === "1:1" &&
      r.sourceParticipation === "mandatory" &&
      r.targetParticipation === "mandatory"
    )
      add(
        "warning",
        "Both sides require participation",
        "The foreign key enforces participation on its owning side. Enforce participation on the other side in your application.",
        ctx,
      );
    if (r.cardinality === "1:N" && r.sourceParticipation === "mandatory")
      add(
        "warning",
        "Minimum participation needs application logic",
        `A foreign key cannot require every ${source.name} record to have a child in ${target.name}. Enforce this rule when inserting or deleting records.`,
        ctx,
      );
    if (
      r.cardinality === "M:N" &&
      (r.sourceParticipation === "mandatory" ||
        r.targetParticipation === "mandatory")
    )
      add(
        "warning",
        "Mandatory enrollment needs application logic",
        "The associative table enforces valid references, but cannot require every entity to have a related row. Enforce minimum participation in your application.",
        ctx,
      );
    if (r.attributes.some((a) => a.multivalued))
      add(
        "error",
        "Multivalued relationship attribute",
        "Use single-valued relationship attributes, or model an additional entity for these values.",
        ctx,
      );
  }
  const relational = toRelational(schema),
    tableNames = new Set<string>();
  for (const t of relational.tables) {
    const ctx =
      t.kind === "associative"
        ? { relationshipId: t.sourceId }
        : { entityId: t.sourceId };
    if (tableNames.has(t.name.toLowerCase()))
      add(
        "error",
        "Generated table name collision",
        `The relational model contains more than one “${t.name}” table. Rename the entity, relationship, or multivalued attribute.`,
        ctx,
      );
    tableNames.add(t.name.toLowerCase());
    if (!validName(t.name))
      add(
        "error",
        "Invalid generated table name",
        `“${t.name}” must be a valid identifier${identifierHint}.`,
        ctx,
      );
    const cols = new Set<string>();
    for (const col of t.columns) {
      if (!validName(col.name))
        add(
          "error",
          "Invalid generated column name",
          `“${col.name}” is not a valid ${engineLabels[engine]} identifier${identifierHint}. Shorten its entity or attribute name.`,
          ctx,
        );
      if (cols.has(col.name.toLowerCase()))
        add(
          "error",
          "Generated column collision",
          `“${col.name}” appears twice in ${t.name}. Rename the relationship attribute.`,
          ctx,
        );
      cols.add(col.name.toLowerCase());
    }
    const keyBytes = t.columns
      .filter((c) => c.primaryKey)
      .reduce(
        (sum, c) =>
          sum +
          (c.type === "VARCHAR"
            ? (c.length ?? 255) * 4
            : c.type === "BIGINT"
              ? 8
              : 4),
        0,
      );
    if (engine === "mysql" && keyBytes > 3072)
      add(
        "error",
        "Primary key exceeds InnoDB limit",
        `${t.name} has a primary key larger than 3,072 bytes. Shorten VARCHAR key lengths.`,
        ctx,
      );
    for (const c of t.columns.filter(
      (c) =>
        engine === "mysql" &&
        c.unique &&
        c.type === "VARCHAR" &&
        (c.length ?? 255) > 768,
    ))
      add(
        "error",
        "Unique index is too large",
        `Shorten ${c.name} to at most 768 characters for utf8mb4.`,
        { ...ctx, attributeId: c.id },
      );
    for (const fk of t.foreignKeys)
      fk.columns.forEach((name, index) => {
        const col = t.columns.find((c) => c.name === name),
          parent = relational.tables
            .find((p) => p.name === fk.referencedTable)
            ?.columns.find((c) => c.name === fk.referencedColumns[index]);
        if (!parent || !col || sqlType(parent) !== sqlType(col))
          add(
            "error",
            "Foreign key type mismatch",
            `The foreign key in ${t.name} does not match its referenced primary key.`,
            ctx,
          );
      });
  }
  const visited = new Set<string>(),
    stack = new Set<string>();
  let cyclic = false;
  const visit = (id: string) => {
    if (stack.has(id)) {
      cyclic = true;
      return;
    }
    if (visited.has(id)) return;
    stack.add(id);
    for (const fk of relational.tables.find((t) => t.id === id)?.foreignKeys ??
      []) {
      const parent = relational.tables.find(
        (t) => t.name === fk.referencedTable,
      );
      if (parent) visit(parent.id);
    }
    stack.delete(id);
    visited.add(id);
  };
  relational.tables.forEach((t) => visit(t.id));
  if (cyclic)
    add(
      "warning",
      "Circular table dependency",
      "SQL creates every table before adding foreign keys. Plan record insertion order carefully.",
    );
  return issues;
}
