import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySchema, sampleSchema } from "../domain/sample";
import { STORAGE_KEY } from "./persistence";
import {
  loadWorkspace,
  mergeProjects,
  nextUpdatedAt,
  projectRecord,
  saveWorkspace,
  workspaceKey,
} from "./workspace";

const data = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
});
beforeEach(() => {
  data.clear();
  vi.restoreAllMocks();
});

describe("workspace storage", () => {
  it("migrates the previous project without changing its diagram", () => {
    const schema = sampleSchema();
    data.set(STORAGE_KEY, JSON.stringify(schema));
    const workspace = loadWorkspace();
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.projects[0].schema).toEqual(schema);
    expect(data.get(STORAGE_KEY)).toBe(JSON.stringify(schema));
  });
  it("persists multiple independent projects and stable IDs", () => {
    const projects = [
      projectRecord(sampleSchema()),
      projectRecord(emptySchema()),
    ];
    expect(saveWorkspace("local", { projects, deletedIds: [] })).toBe(true);
    expect(loadWorkspace().projects).toEqual(projects);
    expect(projects[0].id).not.toBe(projects[1].id);
  });
  it("keeps an empty workspace empty after deleting its last project", () => {
    saveWorkspace("local", { projects: [], deletedIds: [] });
    expect(loadWorkspace().projects).toEqual([]);
  });
  it("isolates local storage and each account's projects", () => {
    const local = projectRecord(sampleSchema()),
      account = projectRecord(emptySchema());
    saveWorkspace("local", { projects: [local], deletedIds: [] });
    saveWorkspace("account.alice", { projects: [account], deletedIds: [] });
    expect(loadWorkspace().projects).toEqual([local]);
    expect(loadWorkspace("account.alice").projects).toEqual([account]);
    expect(loadWorkspace("account.bob").projects).toEqual([]);
  });
  it("keeps corrupt data intact and offers an in-memory fallback", () => {
    data.set(workspaceKey("local"), "invalid");
    expect(loadWorkspace().projects).toHaveLength(1);
    expect(data.get(workspaceKey("local"))).toBe("invalid");
  });
  it("reports storage failures instead of claiming that a project was saved", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveWorkspace("local", { projects: [], deletedIds: [] })).toBe(
      false,
    );
  });
  it("gives rapid changes distinct versions even when the clock has not advanced", () => {
    const now = new Date().toISOString();
    expect(Date.parse(nextUpdatedAt(now))).toBeGreaterThan(Date.parse(now));
  });
});

describe("account cache reconciliation", () => {
  it("keeps an unsynced edit that is newer than the server version", () => {
    const remote = {
      ...projectRecord(sampleSchema()),
      updatedAt: "2026-10-01T01:00:00.000Z",
    };
    const edit = {
      ...remote,
      schema: emptySchema(),
      updatedAt: "2026-10-01T02:00:00.000Z",
    };
    expect(
      mergeProjects([remote], { projects: [edit], deletedIds: [] }),
    ).toEqual([edit]);
  });
  it("prefers a newer server version over an older cache", () => {
    const remote = {
      ...projectRecord(sampleSchema()),
      updatedAt: "2026-10-01T02:00:00.000Z",
    };
    const edit = {
      ...remote,
      schema: emptySchema(),
      updatedAt: "2026-10-01T01:00:00.000Z",
    };
    expect(
      mergeProjects([remote], { projects: [edit], deletedIds: [] }),
    ).toEqual([remote]);
  });
  it("restores an offline-created project and retains pending deletions", () => {
    const removed = projectRecord(sampleSchema()),
      offline = projectRecord(emptySchema());
    expect(
      mergeProjects([removed], {
        projects: [removed, offline],
        deletedIds: [removed.id],
      }),
    ).toEqual([offline]);
  });
  it("does not resurrect clean cached projects deleted on another device", () => {
    const cached = projectRecord(sampleSchema());
    cached.syncedAt = cached.updatedAt;
    expect(mergeProjects([], { projects: [cached], deletedIds: [] })).toEqual(
      [],
    );
  });
});
