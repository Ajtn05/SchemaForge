import type { DatabaseEngine, RelationalSchema } from "../domain/types";
import { generateMySQL } from "./mysql";
import { generatePostgreSQL } from "./postgresql";
export function generateSQL(
  schema: RelationalSchema,
  engine: DatabaseEngine,
  projectName?: string,
): string {
  if (engine === "none") return "";
  return engine === "postgresql"
    ? generatePostgreSQL(schema, projectName)
    : generateMySQL(schema, projectName);
}
