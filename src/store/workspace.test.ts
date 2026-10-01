import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySchema, sampleSchema } from "../domain/sample";
import { loadWorkspace } from "../lib/workspace";
import { useProject } from "./useProject";

const data = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
});
beforeEach(() => {
  data.clear();
  useProject.getState().setWorkspace("local", { projects: [], deletedIds: [] });
});

describe("independent projects", () => {
  it("creates projects without replacing an existing diagram", () => {
    const first = useProject.getState().createProject(sampleSchema());
    const second = useProject.getState().createProject(emptySchema());
    expect(loadWorkspace().projects).toHaveLength(2);
    useProject.getState().openProject(first);
    expect(useProject.getState().schema.entities).toHaveLength(4);
    useProject.getState().openProject(second);
    expect(useProject.getState().schema.entities).toHaveLength(0);
  });
  it("saves edits to the active project and resets history when switching", () => {
    const first = useProject.getState().createProject(sampleSchema());
    const second = useProject.getState().createProject(emptySchema());
    useProject.getState().addEntity();
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().openProject(first);
    expect(useProject.getState().past).toEqual([]);
    useProject.getState().undo();
    expect(useProject.getState().schema.entities).toHaveLength(4);
    useProject.getState().openProject(second);
    expect(useProject.getState().schema.entities).toHaveLength(1);
  });
  it("deletes only the selected project and records a cloud deletion", () => {
    const first = useProject.getState().createProject(sampleSchema());
    const second = useProject.getState().createProject(emptySchema());
    useProject.getState().deleteProject(first);
    expect(loadWorkspace().projects.map((p) => p.id)).toEqual([second]);
    expect(loadWorkspace().deletedIds).toContain(first);
    expect(useProject.getState().activeProjectId).toBe(second);
  });
  it("keeps imported duplicate names as separate projects", () => {
    const schema = sampleSchema();
    useProject.getState().createProject(schema);
    useProject.getState().createProject(schema);
    const projects = useProject.getState().projects;
    expect(projects).toHaveLength(2);
    expect(projects[0].id).not.toBe(projects[1].id);
  });
  it("keeps local projects separate from signed-in account changes", () => {
    useProject.getState().createProject(sampleSchema());
    useProject
      .getState()
      .setWorkspace("account.alice", { projects: [], deletedIds: [] });
    useProject.getState().createProject(emptySchema());
    useProject.getState().addEntity();
    expect(loadWorkspace().projects[0].schema.entities).toHaveLength(4);
    expect(
      loadWorkspace("account.alice").projects[0].schema.entities,
    ).toHaveLength(1);
  });
  it("acknowledges uploads without marking newer local edits as synced", () => {
    const id = useProject.getState().createProject(emptySchema());
    const upload = structuredClone(useProject.getState().projects[0]);
    useProject.getState().addEntity();
    useProject.getState().acknowledgeSync([upload], []);
    expect(useProject.getState().projects[0].syncedAt).not.toBe(
      useProject.getState().projects[0].updatedAt,
    );
    useProject.getState().acknowledgeSync(useProject.getState().projects, []);
    expect(loadWorkspace().projects.find((p) => p.id === id)?.syncedAt).toBe(
      useProject.getState().projects[0].updatedAt,
    );
  });
});
