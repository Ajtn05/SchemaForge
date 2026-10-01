import type { FunctionalDependency, RelationalTable } from "../domain/types";
export type NormalForm = "2NF" | "3NF" | "BCNF";
export interface NormalizationFinding {
  form: NormalForm;
  determinant: string[];
  dependent: string[];
  message: string;
  suggestion: string;
}
export interface NormalizationReport {
  candidateKeys: string[][];
  findings: NormalizationFinding[];
  invalidDependencyIds: string[];
  incomplete: boolean;
  declaredCount: number;
}
const contains = (set: Set<string>, values: string[]) =>
  values.every((v) => set.has(v));
export function attributeClosure(
  seed: string[],
  dependencies: Pick<FunctionalDependency, "determinantIds" | "dependentIds">[],
): Set<string> {
  const result = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of dependencies)
      if (contains(result, d.determinantIds))
        for (const id of d.dependentIds)
          if (!result.has(id)) {
            result.add(id);
            changed = true;
          }
  }
  return result;
}
// Column IDs survive renames. Constraints imply key → all columns; a foreign key
// alone does not imply that its columns determine the rest of the receiving row.
export function analyzeNormalization(
  table: RelationalTable,
  declared: FunctionalDependency[] = [],
): NormalizationReport {
  const all = table.columns.map((c) => c.id);
  const known = new Set(all);
  const relevant = declared.filter((d) => d.tableId === table.id);
  const valid = relevant.filter(
    (d) =>
      d.determinantIds.length &&
      d.dependentIds.length &&
      [...d.determinantIds, ...d.dependentIds].every((id) => known.has(id)),
  );
  const invalidDependencyIds = relevant
    .filter((d) => !valid.includes(d))
    .map((d) => d.id);
  const primary = table.columns.filter((c) => c.primaryKey).map((c) => c.id);
  const constraintKeys = [
    ...(primary.length ? [primary] : []),
    ...table.columns.filter((c) => c.unique && !c.nullable).map((c) => [c.id]),
    ...table.uniqueGroups
      .map((group) =>
        group.map((name) => table.columns.find((c) => c.name === name)),
      )
      .filter((cols) => cols.length && cols.every((c) => c && !c.nullable))
      .map((cols) => cols.map((c) => c!.id)),
  ];
  const dependencies = [
    ...valid,
    ...constraintKeys.map((key) => ({
      determinantIds: key,
      dependentIds: all,
    })),
  ];
  const closure = (key: string[]) => attributeClosure(key, dependencies);
  const isSuperkey = (key: string[]) => contains(closure(key), all);
  const rhs = new Set(
    dependencies.flatMap((d) =>
      d.dependentIds.filter((id) => !d.determinantIds.includes(id)),
    ),
  );
  const lhs = new Set(dependencies.flatMap((d) => d.determinantIds));
  const required = all.filter((id) => !rhs.has(id));
  const optional = all.filter((id) => lhs.has(id) && !required.includes(id));
  const candidateKeys: string[][] = [];
  const queue: { key: string[]; next: number }[] = [{ key: required, next: 0 }];
  const LIMIT = 4096;
  let checked = 0,
    incomplete = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (++checked > LIMIT) {
      incomplete = true;
      break;
    }
    const { key, next } = queue[cursor];
    if (candidateKeys.some((k) => k.every((id) => key.includes(id)))) continue;
    if (isSuperkey(key)) {
      candidateKeys.push(key);
      continue;
    }
    for (let i = next; i < optional.length; i++) {
      if (queue.length >= LIMIT) {
        incomplete = true;
        break;
      }
      queue.push({ key: [...key, optional[i]], next: i + 1 });
    }
  }
  const name = (ids: string[]) =>
    ids
      .map((id) => table.columns.find((c) => c.id === id)?.name ?? id)
      .join(", ");
  const prime = new Set(candidateKeys.flat());
  const findings: NormalizationFinding[] = [];
  const seen = new Set<string>();
  const add = (
    form: NormalForm,
    determinant: string[],
    dependent: string[],
    message: string,
  ) => {
    const signature = `${form}:${[...determinant].sort().join("|")}:${[...dependent].sort().join("|")}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    findings.push({
      form,
      determinant,
      dependent,
      message,
      suggestion: `Consider a relation containing ${name([...new Set([...determinant, ...dependent])])}, keyed by ${name(determinant) || "the constant fact"}. Review lossless joins and dependency preservation before changing tables.`,
    });
  };
  // Test subsets against closure, so indirect partial dependencies are detected.
  if (!incomplete)
    for (const key of candidateKeys) {
      const subsets: string[][] = [[]];
      for (const id of key) {
        if (subsets.length * 2 > LIMIT) {
          incomplete = true;
          break;
        }
        subsets.push(...subsets.map((set) => [...set, id]));
      }
      if (incomplete) break;
      for (const subset of subsets)
        if (subset.length < key.length) {
          const dependent = [...closure(subset)].filter(
            (id) => !prime.has(id) && !subset.includes(id),
          );
          if (dependent.length)
            add(
              "2NF",
              subset,
              dependent,
              `${name(dependent)} depends on a proper subset of candidate key (${name(key)}): ${name(subset) || "the empty set"}.`,
            );
        }
    }
  for (const d of valid) {
    const nontrivial = d.dependentIds.filter(
      (id) => !d.determinantIds.includes(id),
    );
    if (!nontrivial.length || isSuperkey(d.determinantIds)) continue;
    add(
      "BCNF",
      d.determinantIds,
      nontrivial,
      `${name(d.determinantIds)} → ${name(nontrivial)} has a determinant that is not a superkey.`,
    );
    const nonprime = nontrivial.filter((id) => !prime.has(id));
    if (!incomplete && nonprime.length)
      add(
        "3NF",
        d.determinantIds,
        nonprime,
        `${name(d.determinantIds)} → ${name(nonprime)} has a non-superkey determinant and non-prime dependent columns.`,
      );
  }
  // Partial enumeration cannot establish prime attributes or 2NF/3NF conclusions.
  if (incomplete)
    findings.splice(
      0,
      findings.length,
      ...findings.filter((f) => f.form === "BCNF"),
    );
  return {
    candidateKeys,
    findings,
    invalidDependencyIds,
    incomplete,
    declaredCount: relevant.length,
  };
}
