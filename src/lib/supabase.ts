import { createClient } from "@supabase/supabase-js";
import { isSchema } from "./persistence";
import type { ProjectRecord } from "./workspace";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;

export async function fetchProjects(ownerId: string): Promise<ProjectRecord[]> {
  if (!supabase) throw new Error("Email sign-in has not been configured.");
  const { data, error } = await supabase
    .from("projects")
    .select("id,schema,created_at,updated_at")
    .eq("owner_id", ownerId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    if (!isSchema(row.schema))
      throw new Error(
        "An account project could not be read. Your saved data has been kept.",
      );
    const updatedAt = new Date(row.updated_at).toISOString();
    return {
      id: row.id,
      schema: row.schema,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt,
      syncedAt: updatedAt,
    };
  });
}
export async function syncProjects(
  ownerId: string,
  projects: ProjectRecord[],
  deletedIds: string[],
) {
  if (!supabase) throw new Error("Email sign-in has not been configured.");
  if (projects.length) {
    const { error } = await supabase.from("projects").upsert(
      projects.map((p) => ({
        id: p.id,
        owner_id: ownerId,
        schema: p.schema,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  if (deletedIds.length) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("owner_id", ownerId)
      .in("id", deletedIds);
    if (error) throw error;
  }
}
