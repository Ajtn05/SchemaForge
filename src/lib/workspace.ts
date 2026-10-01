import type { ConceptualSchema } from "../domain/types";
import { sampleSchema, uid } from "../domain/sample";
import { isSchema, loadProject } from "./persistence";

export interface ProjectRecord {
  id: string;
  schema: ConceptualSchema;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}
export interface WorkspaceData {
  projects: ProjectRecord[];
  deletedIds: string[];
}
export const workspaceKey = (scope: string) =>
  `schemaforge.workspace.v1.${scope}`;
export const nextUpdatedAt = (previous: string) =>
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
export function projectRecord(schema: ConceptualSchema): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: uid(),
    schema: structuredClone(schema),
    createdAt: now,
    updatedAt: now,
  };
}
export function loadWorkspace(scope = "local"): WorkspaceData {
  try {
    const raw = localStorage.getItem(workspaceKey(scope));
    if (raw) {
      const input = JSON.parse(raw);
      if (!Array.isArray(input.projects) || !Array.isArray(input.deletedIds))
        throw new Error("Invalid workspace");
      if (
        !input.projects.every(
          (p: ProjectRecord) =>
            typeof p.id === "string" &&
            isSchema(p.schema) &&
            Number.isFinite(Date.parse(p.createdAt)) &&
            Number.isFinite(Date.parse(p.updatedAt)),
        ) ||
        !input.deletedIds.every((id: unknown) => typeof id === "string")
      )
        throw new Error("Invalid workspace");
      return input;
    }
  } catch {
    // Keep damaged storage intact so that an export or recovery remains possible.
  }
  return {
    projects:
      scope === "local" ? [projectRecord(loadProject() ?? sampleSchema())] : [],
    deletedIds: [],
  };
}
export function saveWorkspace(scope: string, data: WorkspaceData): boolean {
  try {
    localStorage.setItem(workspaceKey(scope), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function mergeProjects(
  remote: ProjectRecord[],
  cache: WorkspaceData,
): ProjectRecord[] {
  const projects = new Map(remote.map((p) => [p.id, p]));
  for (const p of cache.projects) {
    const other = projects.get(p.id);
    if (
      p.syncedAt !== p.updatedAt &&
      (!other || Date.parse(p.updatedAt) > Date.parse(other.updatedAt))
    )
      projects.set(p.id, p);
  }
  for (const id of cache.deletedIds) projects.delete(id);
  return [...projects.values()];
}
