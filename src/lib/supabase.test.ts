import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSchema } from "../domain/sample";
import { projectRecord } from "./workspace";

const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => client }));
vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
const { fetchProjects, syncProjects } = await import("./supabase");
beforeEach(() => {
  vi.clearAllMocks();
});

describe("account project API", () => {
  it("fetches only the current owner's projects and normalizes timestamps", async () => {
    const schema = sampleSchema();
    const eq = vi
      .fn()
      .mockResolvedValue({
        data: [
          {
            id: "project",
            schema,
            created_at: "2026-10-01T00:00:00+00:00",
            updated_at: "2026-10-01T00:00:00+00:00",
          },
        ],
        error: null,
      });
    const select = vi.fn().mockReturnValue({ eq });
    client.from.mockReturnValue({ select });
    const projects = await fetchProjects("alice");
    expect(eq).toHaveBeenCalledWith("owner_id", "alice");
    expect(projects[0]).toMatchObject({
      id: "project",
      schema,
      updatedAt: "2026-10-01T00:00:00.000Z",
      syncedAt: "2026-10-01T00:00:00.000Z",
    });
  });
  it("rejects unreadable account records instead of overwriting them", async () => {
    client.from.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({ data: [{ id: "bad", schema: {} }], error: null }),
      }),
    });
    await expect(fetchProjects("alice")).rejects.toThrow(
      "saved data has been kept",
    );
  });
  it("surfaces access and connectivity errors", async () => {
    client.from.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({ data: null, error: new Error("unavailable") }),
      }),
    });
    await expect(fetchProjects("alice")).rejects.toThrow("unavailable");
  });
  it("uploads projects with their owner and deletes with an owner filter", async () => {
    const project = projectRecord(sampleSchema());
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ in: remove });
    client.from.mockReturnValue({ upsert, delete: () => ({ eq }) });
    await syncProjects("alice", [project], ["removed"]);
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: project.id,
          owner_id: "alice",
          schema: project.schema,
          created_at: project.createdAt,
          updated_at: project.updatedAt,
        },
      ],
      { onConflict: "id" },
    );
    expect(eq).toHaveBeenCalledWith("owner_id", "alice");
    expect(remove).toHaveBeenCalledWith("id", ["removed"]);
  });
  it("does not claim sync success when an upload or deletion fails", async () => {
    const project = projectRecord(sampleSchema());
    client.from.mockReturnValue({
      upsert: () => Promise.resolve({ error: new Error("upload failed") }),
    });
    await expect(syncProjects("alice", [project], [])).rejects.toThrow(
      "upload failed",
    );
    client.from.mockReturnValue({
      delete: () => ({
        eq: () => ({
          in: () => Promise.resolve({ error: new Error("delete failed") }),
        }),
      }),
    });
    await expect(syncProjects("alice", [], [project.id])).rejects.toThrow(
      "delete failed",
    );
  });
});
