import type { ConceptualSchema, DatabaseEngine } from "../domain/types";
export const engineLabels: Record<DatabaseEngine, string> = {
  none: "No engine",
  mysql: "MySQL 8.0",
  postgresql: "PostgreSQL",
};
// Existing projects predate engine settings and must keep their MySQL output.
export const projectEngine = (schema: ConceptualSchema): DatabaseEngine =>
  schema.engine ?? "mysql";
